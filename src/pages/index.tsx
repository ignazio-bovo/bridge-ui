import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import Image from "next/image";
import localFont from "next/font/local";
import { useEffect, useState } from "react"
import { ethers } from "ethers"

declare global {
  interface Window {
    ethereum?: any;
  }
}

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

// Form validation schema
const formSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  transferType: z.string().min(1, "Transfer type is required"),
  address: z.string().min(42, "Invalid address length").max(42),
  chainId: z.string().min(1, "Chain is required"),
})

// Update NETWORKS with chainId as numbers instead of strings
const NETWORKS = {
  "ethereum": {
    chainId: 31337,
    chainName: "Local Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["http://localhost:8545"],
  },
  "subtensor": {
    chainId: 31338,
    chainName: "Local Subtensor",
    nativeCurrency: { name: "Subtensor", symbol: "TAO", decimals: 18 },
    rpcUrls: ["http://localhost:8546"],
  },
};

// Add these constants at the top level with your NETWORKS
const BRIDGE_ADDRESS = "0x71c95911e9a5d330f4d621842ec243ee1343292e"
const BRIDGED_TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"

export default function Home() {
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null)
  const [account, setAccount] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [nativeBalance, setNativeBalance] = useState<string>("")
  const [tokenBalance, setTokenBalance] = useState<string>("")
  const [currentNetwork, setCurrentNetwork] = useState<'ethereum' | 'subtensor' | ''>('')

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: "",
      transferType: "",
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      chainId: "",
    },
  })

  // Initialize provider
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).ethereum !== undefined) {
      const provider = new ethers.providers.Web3Provider((window as any).ethereum)
      setProvider(provider)
    }
  }, [])

  // Update connectWallet to set numeric chainId
  const connectWallet = async (networkType: 'ethereum' | 'subtensor') => {
    try {
      if (!window.ethereum) {
        alert("Please install MetaMask!");
        return;
      }

      console.log(`Connecting to ${networkType}...`);
      const targetChainId = NETWORKS[networkType].chainId;
      const hexChainId = `0x${targetChainId.toString(16)}`;
      
      console.log('Network config:', NETWORKS[networkType]);
      console.log('Hex Chain ID:', hexChainId);

      // Try to add the network first
      try {
        const addNetworkParams = {
          chainId: hexChainId,
          chainName: NETWORKS[networkType].chainName,
          nativeCurrency: NETWORKS[networkType].nativeCurrency,
          rpcUrls: NETWORKS[networkType].rpcUrls,
        };
        console.log('Adding network with params:', addNetworkParams);
        
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [addNetworkParams],
        });
      } catch (error) {
        console.error('Error adding network:', error);
        return;
      }

      // Then switch to it
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }],
        });
      } catch (error) {
        console.error('Error switching network:', error);
        return;
      }

      // Rest of connection logic
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(web3Provider);
      
      const signer = web3Provider.getSigner();
      const address = await signer.getAddress();
      setAccount(address);
      setCurrentNetwork(networkType);
      
      // Set the destination chainId
      const destinationChainId = networkType === 'ethereum' ? '31338' : '31337';
      form.setValue('chainId', destinationChainId);

    } catch (error) {
      console.error(`Error connecting to ${networkType}:`, error);
    }
  };

  // Update switchNetwork to handle numeric chainIds
  const switchNetwork = async (chainId: string) => {
    if (!provider) return;
    
    // Convert chainId to network type
    const networkType = chainId === "31337" ? "ethereum" : "subtensor";
    const newProvider = new ethers.providers.JsonRpcProvider(
      NETWORKS[networkType].rpcUrls[0]
    );
    setProvider(newProvider as any);
    
    // Get new signer and address
    const signer = newProvider.getSigner();
    const address = await signer.getAddress();
    setAccount(address);
    setCurrentNetwork(networkType);
  };

  // Update updateBalances to use standard 18 decimals
  const updateBalances = async () => {
    if (!provider || !account) return;
    
    try {
      // Get native balance
      const balance = await provider.getBalance(account);
      const formattedNativeBalance = ethers.utils.formatEther(balance);
      setNativeBalance(formattedNativeBalance);

      // Get ERC20 balance
      const tokenContract = new ethers.Contract(
        BRIDGED_TOKEN_ADDRESS,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      );
      const tokenBal = await tokenContract.balanceOf(account);
      const formattedTokenBalance = ethers.utils.formatEther(tokenBal);
      setTokenBalance(formattedTokenBalance);
    } catch (error) {
      console.error("Error fetching balances:", error);
    }
  };

  // Update the useEffect to also trigger on currentNetwork changes
  useEffect(() => {
    const transferType = form.watch("transferType");
    if (transferType) {
      updateBalances();
    }
  }, [account, provider, currentNetwork, form.watch("transferType")]);

  // Update onSubmit to use standard 18 decimals
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!provider || !account) {
      alert("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const signer = provider.getSigner();
      const bridge = new ethers.Contract(
        BRIDGE_ADDRESS,
        ["function requestTransfer(address, uint256, uint64, bool) payable"],
        signer
      );
      
      const amount = ethers.utils.parseEther(values.amount);
      const isNative = values.transferType === "native";
      
      // Get the current nonce
      const nonce = await provider.getTransactionCount(account);
      
      // Add higher gas price settings and nonce
      const gasPrice = await provider.getGasPrice();
      const increasedGasPrice = gasPrice.mul(2);
      const txOptions = {
        gasPrice: increasedGasPrice,
        gasLimit: 300000,
        nonce: nonce // Add the nonce here
      };
      
      if (!isNative) {
        // Handle ERC20 approval with nonce
        const bridgedToken = new ethers.Contract(
          BRIDGED_TOKEN_ADDRESS,
          ["function approve(address, uint256)"],
          signer
        );
        const approveTx = await bridgedToken.approve(BRIDGE_ADDRESS, amount, txOptions);
        await approveTx.wait();
        
        // Increment nonce for the next transaction
        txOptions.nonce = nonce + 1;
        console.log("Approved bridged token");
      }

      console.log("Requesting transfer...");
      const destinationChainId = parseInt(values.chainId);
      console.log("Destination chain ID:", destinationChainId);

      // Include gas settings and nonce in the transfer transaction
      const transferTxOptions = {
        ...txOptions,
        value: isNative ? amount : 0
      };

      const tx = await bridge.requestTransfer(
        values.address,
        amount,
        destinationChainId,
        isNative,
        transferTxOptions
      );
      await tx.wait();
      console.log("Transfer request submitted successfully!");
      
      await updateBalances();
      alert("Transfer request submitted successfully!");
    } catch (error) {
      console.error("Transaction failed:", error);
      alert("Transaction failed. Check console for details.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} min-h-screen p-8`}>
      <main className="max-w-md mx-auto mt-10">
        {/* Replace single connect button with two network-specific buttons */}
        <div className="flex gap-4 mb-6">
          <Button 
            onClick={() => connectWallet('ethereum')} 
            className="w-full"
            disabled={!!account}
          >
            Connect to Ethereum
          </Button>
          <Button 
            onClick={() => connectWallet('subtensor')} 
            className="w-full"
            disabled={!!account}
          >
            Connect to Subtensor
          </Button>
        </div>
        
        {account && (
          <div className="mb-6 text-center">
            <div className="text-base text-muted-foreground break-all">
              {account}
            </div>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type="number" step="0.000001" placeholder="Enter amount" {...field} />
                      {form.watch("transferType") && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          Max: {form.watch("transferType") === "native" ? nativeBalance : 
                                form.watch("transferType") === "erc20" ? tokenBalance : ""} 
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transferType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Transfer Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select transfer type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="erc20">ERC20 Transfer</SelectItem>
                      <SelectItem value="native">Native Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Address</FormLabel>
                  <FormControl>
                    <Input placeholder="0x..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="chainId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Destination Chain</FormLabel>
                  <FormControl>
                    <div className="p-2 border rounded-md bg-muted">
                      {currentNetwork === 'ethereum' ? `Local Subtensor (Chain ID: ${field.value})` : 
                       currentNetwork === 'subtensor' ? `Local Ethereum (Chain ID: ${field.value})` : 
                       'Connect wallet to see destination'}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading || !account}
            >
              {loading ? "Processing..." : "Submit Transfer"}
            </Button>
          </form>
        </Form>
      </main>
    </div>
  );
}
