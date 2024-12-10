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
  destinationChainId: z.string().min(1, "Chain is required"),
})

/**
 * @notice Network configuration for supported chains
 * @dev Stores chain IDs, names, native currencies and RPC endpoints
 */
const NETWORKS = {
  "ethereum": {
    chainId: 31337,
    chainName: "Local Ethereum",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["http://127.0.0.1:8545"],
  },
  "subtensor": {
    chainId: 945,
    chainName: "Local Subtensor",
    nativeCurrency: { name: "Subtensor", symbol: "TAO", decimals: 18 },
    rpcUrls: ["http://127.0.0.1:9944"],
  },
};

// @longprao this is the bridge contract address for the ethereum network, should be changed to the deployed bridge contract address in production
const BRIDGE_ADDRESS = "0x71c95911e9a5d330f4d621842ec243ee1343292e"
const BRIDGED_TOKEN_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3"
const BRIDGE_ADDRESS_SUBTENSOR = "0x71c95911e9a5d330f4d621842ec243ee1343292e"
const BRIDGED_TOKEN_ADDRESS_SUBTENSOR = "0x5fbdb2315678afecb367f032d93f642f64180aa3"

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
      destinationChainId: "",
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
      const destinationChainId = networkType === 'ethereum' ? NETWORKS.ethereum.chainId : NETWORKS.subtensor.chainId;
      form.setValue('destinationChainId', destinationChainId.toString());

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

      // TODO: This should be replaced by a call to a token API for the datura bridge
      // The contract design has changed since the demo and the token deployment has been removed.
      // @longprao if you are able to develop the front end without this for the moment I have to discuss this part with @mz-datura
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

  // Update onSubmit to use network-specific addresses
  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!provider || !account) {
      alert("Please connect your wallet first");
      return;
    }

    setLoading(true);
    try {
      const signer = provider.getSigner();
      // Use different bridge address based on current network
      const bridgeAddr = currentNetwork === 'subtensor' ? BRIDGE_ADDRESS_SUBTENSOR : BRIDGE_ADDRESS;
      const bridge = new ethers.Contract(
        bridgeAddr,
        ["function requestTransfer(address token, address to, uint256 amount, uint64 destChainId) payable"],
        signer
      );
      
      const amount = ethers.utils.parseEther(values.amount);
      // @longprao this is not out of date, we support all erc20 + native (ETH / TAO)
      // so the `values.transferType` is not just "native" or "erc20" but must be inferred from the token address (Native address is 0x0)
      const isNative = values.transferType === "native"; 
      console.log("Is native:", isNative);
      
      const gasPrice = await provider.getGasPrice();

      // Use different token address based on current network
      const tokenAddr = isNative ? ethers.constants.AddressZero : 
        (currentNetwork === 'subtensor' ? BRIDGED_TOKEN_ADDRESS_SUBTENSOR : BRIDGED_TOKEN_ADDRESS);
      
      console.log("Token address:", tokenAddr);

      // For ERC20 transfers, handle approve transaction first
      if (!isNative) {
        const bridgedToken = new ethers.Contract(
          tokenAddr,
          ["function approve(address, uint256)"],
          signer
        );
        const approveTx = await bridgedToken.approve(bridgeAddr, amount, {
          gasPrice: gasPrice,
          gasLimit: 300000, // @longprao this is the gas limit rule of thumb value, should be updated to a dynamic gas limit using ethers.js
        });
        await approveTx.wait();
        
        console.log("Approved bridged token");
      }

      // Get the current nonce for the signer
      const nonce = await provider.getTransactionCount(account);

      // Submit transfer with current nonce
      console.log("Requesting transfer...");
      const destinationChainId = parseInt(values.destinationChainId);
      console.log("Destination chain ID:", destinationChainId);

      // @longprao this is the transaction submission logic
      try {
        const tx = await bridge.requestTransfer(
          tokenAddr,
          values.address,
          amount,
          destinationChainId,
          {
            gasPrice: gasPrice,
            // @longprao should be updated to a dynamic gas limit (I suppose ethers.js has a function for this)
            // but this value is good if you want to test quickly other feature and bypass gas limit estimation
             gasLimit: 300000,
            value: isNative ? amount : 0, // @longprao this value is the amount of native currency being transferred to the bridge contract
            // @longprao this should allow you to restart the local hardhat node and submit the same transaction again, without disconnecting the wallet
            nonce: nonce
          } // @longprao notice that necessary native amount needed is value + gas price * gas limit, otherwise the transaction will fail
        );
        console.log("Transaction submitted:", tx.hash);
        const receipt = await tx.wait();
        if (receipt.status === 0) {
          console.error("Transaction reverted");
          throw new Error("Transaction reverted");
        }
        console.log("Transfer request submitted successfully!");
      } catch (error: any) {
        if (error.code === 'ACTION_REJECTED') {
          console.error("Transaction rejected by user");
          throw new Error("Transaction rejected by user");
        } else if (error.code === 'INSUFFICIENT_FUNDS') {
          console.error("Insufficient funds for transaction");
          throw new Error("Insufficient funds for transaction");
        } else {
          console.error("Transaction failed:", error.message || error);
          throw error;
        }
      }
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
              name="destinationChainId"
              render={({ field }) => {
                // Set destination chain ID based on current network
                const destinationChainId = currentNetwork === 'ethereum' ? 
                  NETWORKS.subtensor.chainId.toString() : 
                  NETWORKS.ethereum.chainId.toString();

                // Update form value when destination changes
                if (destinationChainId && field.value !== destinationChainId) {
                  field.onChange(destinationChainId);
                }

                return (
                  <FormItem>
                    <FormLabel>Destination Chain</FormLabel>
                    <FormControl>
                      <div className="p-2 border rounded-md bg-muted">
                        {currentNetwork === 'ethereum' ? `Local Subtensor (Chain ID: ${NETWORKS.subtensor.chainId})` : 
                         currentNetwork === 'subtensor' ? `Local Ethereum (Chain ID: ${NETWORKS.ethereum.chainId})` : 
                         'Connect wallet to see destination'}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
