'use client'

import { Button } from '@/components/ui/button';
import { createReport, createUser, getRecentReports, getUserByEmail } from '@/utils/db/actions';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Libraries, StandaloneSearchBox, useJsApiLoader } from '@react-google-maps/api';
import { CheckCircle, Loader, MapPin, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

const geminiApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Add detailed logging
console.log('API Key Debug:', {
  isDefined: !!geminiApiKey,
  length: geminiApiKey?.length,
  firstFourChars: geminiApiKey?.substring(0, 4),
  containsSpaces: geminiApiKey?.includes(' '),
  rawKey: geminiApiKey // Be careful with this in production!
});

const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const libraries: Libraries = ['places'];

export default function ReportPage() {
  const [user, setUser] = useState<{ id: number; email: string; name: string } | null>(null);
  const router = useRouter();

  const [reports, setReports] = useState<Array<{
    id: number;
    location: string;
    wasteType: string;
    amount: string;
    createdAt: string;
  }>>([]);

  const [newReport, setNewReport] = useState({
    location: '',
    type: '',
    amount: '',
  })

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'failure'>('idle')
  const [verificationResult, setVerificationResult] = useState<{
    wasteType: string;
    quantity: string;
    confidence: number;
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [searchBox, setSearchBox] = useState<google.maps.places.SearchBox | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: googleMapsApiKey || '',
    libraries: libraries
  });

  const onLoad = useCallback((ref: google.maps.places.SearchBox) => {
    setSearchBox(ref);
  }, []);

  const onPlacesChanged = () => {
    if (searchBox) {
      const places = searchBox.getPlaces();
      if (places && places.length > 0) {
        const place = places[0];
        setNewReport(prev => ({
          ...prev,
          location: place.formatted_address || '',
        }));
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setNewReport({ ...newReport, [name]: value })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(selectedFile)
    }
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const testApiKey = async (apiKey: string) => {
    console.log('Testing API key:', {
      length: apiKey.length,
      prefix: apiKey.substring(0, 4),
      isExpectedFormat: apiKey.match(/^AIza[A-Za-z0-9_-]{35}$/) ? 'yes' : 'no'
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('API Test Results:', {
        status: response.status,
        ok: response.ok,
        errorMessage: data.error?.message || 'none'
      });
      
      if (!response.ok) {
        toast.error(`API Error: ${data.error?.message || 'Unknown error'}`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('API Test Error:', error);
      toast.error(error instanceof Error ? error.message : 'Unknown error occurred');
      return false;
    }
  };

  const handleVerify = async () => {
    if (!file || !geminiApiKey) {
      toast.error('Missing file or API key');
      return;
    }

    const cleanApiKey = geminiApiKey.trim();
    setVerificationStatus('verifying');
    
    try {
      const genAI = new GoogleGenerativeAI(cleanApiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          temperature: 0.1, // Lower temperature for more consistent output
          topK: 32,
          topP: 1,
          maxOutputTokens: 4096,
        },
      });

      const base64Data = await readFileAsBase64(file);

      const imageParts = [
        {
          inlineData: {
            data: base64Data.split(',')[1],
            mimeType: file.type,
          },
        },
      ];

      // More structured prompt to ensure valid JSON response
      const prompt = `Analyze this waste image and respond ONLY with a valid JSON object in exactly this format, no other text:
      {
        "wasteType": "plastic",
        "quantity": "2.5 kg",
        "confidence": 0.95
      }

      Notes:
      - wasteType must be one of: plastic, paper, glass, metal, organic
      - quantity must include a number and unit (kg or L)
      - confidence must be a number between 0 and 1
      - Do not include any explanations or additional text
      - Ensure the response is valid JSON`;

      const result = await model.generateContent([prompt, ...imageParts]);
      const response = await result.response;
      const text = response.text().trim();
      
      console.log('Raw AI Response:', text);

      try {
        // Try to clean the response if it contains markdown code blocks
        const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
        console.log('Cleaned Response:', cleanedText);

        const parsedResult = JSON.parse(cleanedText);
        
        // Validate the parsed result
        if (!parsedResult.wasteType || !parsedResult.quantity || typeof parsedResult.confidence !== 'number') {
          throw new Error('Response missing required fields');
        }

        // Validate waste type
        const validWasteTypes = ['plastic', 'paper', 'glass', 'metal', 'organic'];
        if (!validWasteTypes.includes(parsedResult.wasteType.toLowerCase())) {
          throw new Error('Invalid waste type');
        }

        // Validate quantity format
        if (!/^\d+\.?\d*\s*(kg|l)$/i.test(parsedResult.quantity)) {
          throw new Error('Invalid quantity format');
        }

        // Validate confidence
        if (parsedResult.confidence < 0 || parsedResult.confidence > 1) {
          throw new Error('Invalid confidence value');
        }

        setVerificationResult(parsedResult);
        setVerificationStatus('success');
        setNewReport({
          ...newReport,
          type: parsedResult.wasteType,
          amount: parsedResult.quantity
        });

        toast.success('Waste verification successful!');
      } catch (parseError) {
        console.error('Parse error:', parseError);
        console.error('Failed response:', text);
        toast.error(`Failed to parse AI response: ${parseError.message}`);
        setVerificationStatus('failure');
      }
    } catch (error) {
      console.error('Verification error:', error);
      if (error instanceof Error) {
        toast.error(`Verification failed: ${error.message}`);
      } else {
        toast.error('Verification failed with unknown error');
      }
      setVerificationStatus('failure');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationStatus !== 'success' || !user) {
      toast.error('Please verify the waste before submitting or log in.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      // Define a type for the report response
      type ReportResponse = {
        id: number;
        location: string;
        wasteType: string;
        amount: string;
        createdAt: Date;
      };

      const report = await createReport(
        user.id,
        newReport.location,
        newReport.type,
        newReport.amount,
        preview || undefined,
        verificationResult ? JSON.stringify(verificationResult) : undefined
      ) as ReportResponse; // Cast to ReportResponse instead of any
      
      const formattedReport = {
        id: report.id,
        location: report.location,
        wasteType: report.wasteType,
        amount: report.amount,
        createdAt: report.createdAt.toISOString().split('T')[0]
      };
      
      setReports([formattedReport, ...reports]);
      setNewReport({ location: '', type: '', amount: '' });
      setFile(null);
      setPreview(null);
      setVerificationStatus('idle');
      setVerificationResult(null);
      

      toast.success(`Report submitted successfully! You've earned points for reporting waste.`);
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Failed to submit report. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    const checkUser = async () => {
      const email = localStorage.getItem('userEmail');
      if (email) {
        let user = await getUserByEmail(email);
        if (!user) {
          user = await createUser(email, 'Anonymous User');
        }
        setUser(user);
        
        const recentReports = await getRecentReports();
        const formattedReports = recentReports.map(report => ({
          ...report,
          createdAt: report.createdAt.toISOString().split('T')[0]
        }));
        setReports(formattedReports);
      } else {
        router.push('/login'); 
      }
    };
    checkUser();
  }, [router]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-semibold mb-6 text-gray-800">Report waste</h1>
      
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-2xl shadow-lg mb-12">
        <div className="mb-8">
          <label htmlFor="waste-image" className="block text-lg font-medium text-gray-700 mb-2">
            Upload Waste Image
          </label>
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:border-green-500 transition-colors duration-300">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600">
                <label
                  htmlFor="waste-image"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-green-600 hover:text-green-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-green-500"
                >
                  <span>Upload a file</span>
                  <input id="waste-image" name="waste-image" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
            </div>
          </div>
        </div>
        
        {preview && (
          <div className="mt-4 mb-8">
            <img src={preview} alt="Waste preview" className="max-w-full h-auto rounded-xl shadow-md" />
          </div>
        )}
        
        <Button 
          type="button" 
          onClick={handleVerify} 
          className="w-full mb-8 bg-blue-600 hover:bg-blue-700 text-white py-3 text-lg rounded-xl transition-colors duration-300" 
          disabled={!file || verificationStatus === 'verifying'}
        >
          {verificationStatus === 'verifying' ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Verifying...
            </>
          ) : 'Verify Waste'}
        </Button>

        {verificationStatus === 'success' && verificationResult && (
          <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-8 rounded-r-xl">
            <div className="flex items-center">
              <CheckCircle className="h-6 w-6 text-green-400 mr-3" />
              <div>
                <h3 className="text-lg font-medium text-green-800">Verification Successful</h3>
                <div className="mt-2 text-sm text-green-700">
                  <p>Waste Type: {verificationResult.wasteType}</p>
                  <p>Quantity: {verificationResult.quantity}</p>
                  <p>Confidence: {(verificationResult.confidence * 100).toFixed(2)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            {isLoaded ? (
              <StandaloneSearchBox
                onLoad={onLoad}
                onPlacesChanged={onPlacesChanged}
              >
                <input
                  type="text"
                  id="location"
                  name="location"
                  value={newReport.location}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                  placeholder="Enter waste location"
                />
              </StandaloneSearchBox>
            ) : (
              <input
                type="text"
                id="location"
                name="location"
                value={newReport.location}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300"
                placeholder="Enter waste location"
              />
            )}
          </div>
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Waste Type</label>
            <input
              type="text"
              id="type"
              name="type"
              value={newReport.type}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100"
              placeholder="Verified waste type"
              readOnly
            />
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">Estimated Amount</label>
            <input
              type="text"
              id="amount"
              name="amount"
              value={newReport.amount}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 transition-all duration-300 bg-gray-100"
              placeholder="Verified amount"
              readOnly
            />
          </div>
        </div>
        <Button 
          type="submit" 
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-lg rounded-xl transition-colors duration-300 flex items-center justify-center"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <Loader className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Submitting...
            </>
          ) : 'Submit Report'}
        </Button>
      </form>

      <h2 className="text-3xl font-semibold mb-6 text-gray-800">Recent Reports</h2>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-gray-50 transition-colors duration-200">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <MapPin className="inline-block w-4 h-4 mr-2 text-green-500" />
                    {report.location}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.wasteType}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.amount}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}