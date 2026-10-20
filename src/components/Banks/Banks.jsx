import React, { useState, useEffect } from 'react';
import BankForm from "./BankForm";
import BankList from "./BankList";
import bankService from "../../services/bankService";

const Banks = () => {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Fetch all banks on component mount
    useEffect(() => {
        fetchBanks();
    }, []);

    const fetchBanks = async () => {
        setLoading(true);
        setError('');
        try {
            const response = await bankService.getAllBanks();
            if (response.success) {
                setBanks(response.data);
            } else {
                setError('Failed to load bank accounts');
            }
        } catch (error) {
            console.error('Error fetching banks:', error);
            setError('Unable to connect to server. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const handleBankAdded = () => {
        fetchBanks(); // Refresh the list
    };

    const handleBankDeleted = (deletedId) => {
        setBanks(prev => prev.filter(bank => bank.id !== deletedId));
    };

    if (loading && banks.length === 0) {
        return (
            <div className="min-h-screen bg-gray-100 py-12">
                <div className="max-w-4xl mx-auto px-4">
                    <div className="bg-white rounded-lg shadow-md p-8 text-center">
                        <div className="animate-pulse">
                            <div className="text-gray-400 text-4xl mb-4">🏦</div>
                            <div className="h-4 bg-gray-200 rounded w-1/2 mx-auto mb-2"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/3 mx-auto"></div>
                        </div>
                        <p className="text-gray-500 mt-4">Loading bank accounts...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 py-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              
                {/* Error Alert */}
                {error && (
                    <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
                        <strong>Error:</strong> {error}
                        <button
                            onClick={fetchBanks}
                            className="ml-4 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Bank Form */}
                <BankForm onBankAdded={handleBankAdded} />

                {/* Bank List */}
                <div className="mt-8">
                    <BankList 
                        banks={banks} 
                        onBankDeleted={handleBankDeleted}
                        onRefresh={fetchBanks}
                    />
                </div>
            </div>
        </div>
    );
};

export default Banks;