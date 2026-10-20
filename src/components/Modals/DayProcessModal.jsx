import React, { useState, useEffect } from 'react';
import api from '../../api';
import toast from 'react-hot-toast';
import { BASE_PATH } from '../../config';

const DayProcessModal = ({ isOpen, onClose }) => {
    // Get today's date (YYYY-MM-DD)
    const getTodayDate = () => new Date().toISOString().split('T')[0];

    const [processDate, setProcessDate] = useState(getTodayDate());
    const [isLoading, setIsLoading] = useState(false);

    // Reset date whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setProcessDate(getTodayDate());
        }
    }, [isOpen]);

    const handleProcess = async () => {
        if (!processDate) {
            toast.error("Please select a date to process.");
            return;
        }

        if (
            !window.confirm(
                `Are you sure you want to move all sales data for ${processDate} to history? This action cannot be undone.`
            )
        ) {
            return;
        }

        setIsLoading(true);

        try {
            const response = await api.post('/sales/process-day', {
                date: processDate,
            });

            if (response.data.success) {
                toast.success(
                    response.data.message ||
                    `Day process completed successfully for ${processDate}!`
                );

                // Close modal first
                onClose();

                // ✅ Redirect immediately to login page
                window.location.href = `${BASE_PATH}/login`;
            } else {
                toast.error(
                    response.data.message || "An unknown error occurred during day process."
                );
            }
        } catch (error) {
            console.error("Day Process Error:", error);
            const errorMessage =
                error.response?.data?.message ||
                `Failed to process day for ${processDate}. Check console for details.`;
            toast.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="modal show d-block"
            tabIndex="-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
            <div className="modal-dialog modal-sm">
                <div className="modal-content">
                    <div className="modal-header bg-success text-white">
                        <h5 className="modal-title">
                            <i className="material-icons align-middle me-2">
                                event_available
                            </i>
                            Day Process
                        </h5>
                        <button
                            type="button"
                            className="btn-close btn-close-white"
                            onClick={onClose}
                            disabled={isLoading}
                        ></button>
                    </div>

                    <div className="modal-body">
                        <p className="text-muted">
                            Select the date for which sales data will be <strong>moved</strong> to the history table.
                        </p>

                        <div className="mb-3">
                            <label
                                htmlFor="processDate"
                                className="form-label fw-bold"
                            >
                                Select Date:
                            </label>
                            <input
                                type="date"
                                className="form-control"
                                id="processDate"
                                value={processDate}
                                onChange={(e) => setProcessDate(e.target.value)}
                                disabled={isLoading}
                            />
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            Cancel
                        </button>

                        <button
                            type="button"
                            className="btn btn-success"
                            onClick={handleProcess}
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <span
                                        className="spinner-border spinner-border-sm me-2"
                                        role="status"
                                        aria-hidden="true"
                                    ></span>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <i className="material-icons align-middle me-1">
                                        done_all
                                    </i>
                                    Confirm Process
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DayProcessModal;
