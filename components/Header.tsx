// @ts-nocheck
'use client';
import { useState, useEffect } from 'react'
import Link from 'next/link'  // Correct import (next/link, not next/Link)
import { usePathname } from 'next/navigation'
import { Button } from './ui/button'
import { Menu, Coins, Leaf, Search, Bell, User, ChevronDown, LogIn, LogOut } from 'lucide-react' 
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Badge } from "./ui/badge"
import { Web3Auth } from '@web3auth/modal'
import { CHAIN_NAMESPACES, IProvider, WEB3AUTH_NETWORK } from '@web3auth/base'
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider'
import { createUser, getUnreadNotifications, getUserBalance, getuUserByEmail, markNotificationAsRead } from '@/utils/db/actions'

const clientId = process.env.WEB3_AUTH_CLIENT_ID
const chainConfig = {
  chainNamespace: CHAIN_NAMESPACES.EIP155,
  chainId: '0xaa36a7',
  rpcTarget: 'https://rpc.ankr.com/eth_sepolia',
  displayName: 'Sepolia Testnet',
  blockExplorerUrl: 'https://sepolia.etherscan.io',
  ticker: 'ETH',
  tickerName: 'Ethereum',
  logo: 'http://assets.web3auth.io/evm-chains/sepolia.png',
};

const privateKeyProvider = new EthereumPrivateKeyProvider({
  config:{ chainConfig},  // Removed unnecessary object wrapping
});

const web3auth = new Web3Auth({
  clientId,
  web3AuthNetwork: WEB3AUTH_NETWORK.TESTNET,
  privateKeyProvider,
});

interface HeaderProps {
  onMenuClick: () => void;
  totalEarnings: number;
}

export default function Header({ onMenuClick, totalEarnings }: HeaderProps) {
  const [provider, setProvider] = useState<IProvider | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [notification, setNotification] = useState<Notification[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        await web3auth.initModal();
        setProvider(web3auth.provider);
        if (web3auth.connected) {
          setLoggedIn(true);
          const user = await web3auth.getUserInfo();
          setUserInfo(user);
          if (user.email) {
            localStorage.setItem('userEmail', user.email);
            try {
              await createUser(user.email, user.name || 'Anonymous user');
            } catch (error) {
              console.error('Error creating user', error);
            }
          }
        }
      } catch (error) {
        console.error('Error initializing Web3Auth', error);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const fetchNotifications = async () => {
      if (userInfo && userInfo.email) {
        const user = await getuUserByEmail(userInfo.email);
        if (user) {
          const unreadNotifications = await getUnreadNotifications(user.id);
          setNotification(unreadNotifications);
        }
      }
    };
    fetchNotifications();
    const NotificationInterval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(NotificationInterval);
  }, [userInfo]);

  useEffect(() => {
    const fetchUserBalance = async () => {
      if (userInfo && userInfo.email) {
        const user = await getUserByEmail(userInfo.email);
        if (user) {
          const userBalance = await getUserBalance(user.id);
          setBalance(userBalance);
        }
      }
    };
    fetchUserBalance();
    const handleBalanceUpdate = (event: CustomEvent) => {
      setBalance(event.detail);
    };
    window.addEventListener('balanceupdate', handleBalanceUpdate as EventListener);
    return () => {
      window.removeEventListener('balanceupdate', handleBalanceUpdate as EventListener);
    };
  }, [userInfo]);

  const login = async () => {
    if (!web3auth) {
      console.error('web3auth is not initialized');
      return;
    }
    try {
      const web3authProvider = await web3auth.connect();
      setProvider(web3authProvider);
      setLoggedIn(true);
      const user = await web3auth.getUserInfo();
      setUserInfo(user);
      if (user.email) {
        localStorage.setItem('userEmail', user.email);
        try {
          await createUser(user.email, user.name || 'Anonymous User');
        } catch (error) {
          console.error('Error creating user', error);
        }
      }
    } catch (error) {
      console.error('Error logging in', error);
    }
  };

  const logout = async () => {
    if (!web3auth) {
      console.log('web3Auth is not initialized');
      return;
    }
    try {
      await web3auth.logout();
      setProvider(null);
      setLoggedIn(false);
      setUserInfo(null);
      localStorage.removeItem('userEmail');
    } catch (error) {
      console.error('Error logging out', error);
    }
  };

  if (loading) {
    return <div>Loading Web3Auth...</div>;
  }

  return (
    <header className="bg-white border-gray-400 sticky top-0 z-50">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" className="mr-2 md:mr-4" onClick={onMenuClick}>
            <Menu className="h-6 w-6" />
          </Button>
          <Link href="/" className="flex items-center">
            <Leaf className="h-6 w-6 md:h-8 md:w-8 text-green-500 mr-1 md:mr-2" />
            <div className="flex flex-col">
              <span className="font-bold text-base md:text-lg text-gray-800">Zero2Hero</span>
              <span className="text-[8px] md:text-[10px] text-gray-500 -mt-1">ETHOnline24</span>
            </div>
          </Link>
        </div>
        {/* Add other header elements below if needed */}
      </div>
    </header>
  );
}