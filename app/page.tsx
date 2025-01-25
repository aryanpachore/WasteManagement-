// @ts-nocheck
'use client'
import { getAllRewards, getRecentReports, getWasteCollectionTasks } from '@/utils/db/actions'
import { Coins, Leaf, MapPin, Recycle } from 'lucide-react'
import { Poppins } from 'next/font/google'
import { useEffect, useState } from 'react'

const poppins = Poppins({ 
  weight: ['300', '400', '600'],
  subsets: ['latin'],
  display: 'swap',
})

export default function Home() {
  const [impactData, setImpactData] = useState({
    wasteCollected: 0,
    reportsSubmitted: 0,
    tokensEarned: 0,
    co2Offset: 0
  });

  useEffect(() => {
    async function fetchImpactData() {
      try {
        const reports = await getRecentReports(100);
        const rewards = await getAllRewards();
        const tasks = await getWasteCollectionTasks(100);

        const wasteCollected = tasks.reduce((total, task) => {
          const match = task.amount.match(/(\d+(\.\d+)?)/);
          const amount = match ? parseFloat(match[0]) : 0;
          return total + amount;
        }, 0);

        setImpactData({
          wasteCollected: Math.round(wasteCollected * 10) / 10,
          reportsSubmitted: reports.length,
          tokensEarned: rewards.reduce((total, reward) => total + (reward.points || 0), 0),
          co2Offset: Math.round((wasteCollected * 0.5) * 10) / 10
        });
      } catch (error) {
        console.error("Error fetching impact data:", error);
      }
    }

    fetchImpactData();
  }, []);

  return (
    <div className={`container mx-auto px-4 py-8 ${poppins.className}`}>
      <section className="bg-white p-8 rounded-3xl shadow-lg mb-8">
        <h2 className="text-3xl font-bold mb-8 text-center text-gray-800">Our Impact</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <ImpactCard title="Waste Collected" value={`${impactData.wasteCollected} kg`} icon={Recycle} />
          <ImpactCard title="Reports Submitted" value={impactData.reportsSubmitted.toString()} icon={MapPin} />
          <ImpactCard title="Tokens Earned" value={impactData.tokensEarned.toString()} icon={Coins} />
          <ImpactCard title="CO2 Offset" value={`${impactData.co2Offset} kg`} icon={Leaf} />
        </div>
      </section>
    </div>
  )
}

function ImpactCard({ title, value, icon: Icon }: { title: string; value: string; icon: React.ElementType }) {
  return (
    <div className="p-6 rounded-xl bg-gray-50 border border-gray-100 transition-all duration-300 ease-in-out hover:shadow-md">
      <Icon className="h-10 w-10 text-green-500 mb-4" />
      <p className="text-3xl font-bold mb-2 text-gray-800">{value}</p>
      <p className="text-sm text-gray-600">{title}</p>
    </div>
  )
}

function FeatureCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out flex flex-col items-center text-center">
      <div className="bg-green-100 p-4 rounded-full mb-6">
        <Icon className="h-8 w-8 text-green-600" />
      </div>
      <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}