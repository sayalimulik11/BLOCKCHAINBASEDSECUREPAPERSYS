import { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import ExamVaultArtifact from '../../../packages/contracts-types/abi/ExamVault.json';
import { useAuth } from '../auth/AuthContext';

const DEFAULT_CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ?? '0x5FbDB2315678afecb367f032d93F642f64180aa3';

export interface ExamVaultContractState {
  contract: ethers.Contract | null;
  error: Error | null;
  isLoading: boolean;
}

export function useExamVaultContract(): ExamVaultContractState {
  const { account } = useAuth();
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!account) {
      setContract(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    const ethereum = typeof window === 'undefined' ? null : (window as any).ethereum;
    if (!ethereum) {
      setContract(null);
      setError(new Error('A wallet provider is required to access the examination contract.'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const initializeContract = async () => {
      try {
        const provider = new ethers.BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        const nextContract = new ethers.Contract(
          DEFAULT_CONTRACT_ADDRESS,
          ExamVaultArtifact as any,
          signer,
        );
        if (!isMounted) return;
        setContract(nextContract);
      } catch (thrownError) {
        if (!isMounted) return;
        setContract(null);
        setError(
          thrownError instanceof Error
            ? thrownError
            : new Error('Failed to connect to the examination contract.'),
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeContract();

    return () => {
      isMounted = false;
    };
  }, [account]);

  return { contract, error, isLoading };
}
