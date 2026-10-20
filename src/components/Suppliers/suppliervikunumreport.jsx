// src/components/Suppliers/suppliervikunumreport.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../api';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Divider,
  Switch,
  FormControlLabel,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Avatar,
  Collapse,
  CardActions,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Search,
  Print,
  FileCopy,
  Refresh,
  Clear,
  CheckCircle,
  Cancel,
  Payment,
  AccountBalance,
  Receipt,
  TrendingDown,
  AttachMoney,
  CreditCard,
  AccountBalanceWallet,
  Visibility,
  Warning,
  KeyboardArrowDown,
  KeyboardArrowUp,
  ShoppingCart,
  MoneyOff,
  Assignment,
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { format, isValid } from 'date-fns';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// ==================== STYLED COMPONENTS ====================
const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  marginBottom: theme.spacing(3),
  borderRadius: theme.spacing(2),
  boxShadow: theme.shadows[3],
  transition: 'all 0.3s ease-in-out',
  '&:hover': {
    boxShadow: theme.shadows[6],
  },
}));

const GradientHeader = styled(Box)(({ theme }) => ({
  background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
  color: theme.palette.primary.contrastText,
  padding: theme.spacing(3),
  borderRadius: theme.spacing(2),
  marginBottom: theme.spacing(3),
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: theme.spacing(2),
}));

const StyledStatCard = styled(Card)(({ theme }) => ({
  background: theme.palette.background.paper,
  borderRadius: theme.spacing(2),
  boxShadow: theme.shadows[2],
  transition: 'transform 0.2s, box-shadow 0.2s',
  '&:hover': {
    transform: 'translateY(-4px)',
    boxShadow: theme.shadows[6],
  },
}));

// ==================== HELPER COMPONENTS ====================
const PaymentMethodIcon = ({ method }) => {
  const icons = {
    Cash: <AttachMoney />,
    Cheque: <CreditCard />,
    'Bank Transfer': <AccountBalance />,
    bag_to_box: <ShoppingCart />,
    bill_to_bill: <Assignment />,
    bad_debt: <MoneyOff />,
  };
  return icons[method] || <Payment />;
};

const PaymentMethodChip = ({ method }) => {
  const colors = {
    Cash: 'success',
    Cheque: 'info',
    'Bank Transfer': 'primary',
    bag_to_box: 'warning',
    bill_to_bill: 'secondary',
    bad_debt: 'error',
  };
  const labels = {
    Cash: '💰 Cash',
    Cheque: '💳 Cheque',
    'Bank Transfer': '🏦 Bank Transfer',
    bag_to_box: '📦 Bag to Box',
    bill_to_bill: '📄 Bill to Bill',
    bad_debt: '⚠️ Bad Debt',
  };
  return (
    <Chip
      label={labels[method] || method}
      color={colors[method] || 'default'}
      size="small"
      variant="outlined"
    />
  );
};

const ToggleButton = ({ children, selected, value, onChange }) => {
  const theme = useTheme();
  return (
    <Button
      variant={selected ? 'contained' : 'outlined'}
      onClick={() => onChange(value)}
      sx={{
        borderRadius: 2,
        textTransform: 'none',
        transition: 'all 0.2s',
        ...(selected && {
          bgcolor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
          '&:hover': {
            bgcolor: theme.palette.primary.dark,
          },
        }),
      }}
    >
      {children}
    </Button>
  );
};

// Status Chip Component - Fixed
const StatusChipComponent = ({ status, label, icon }) => {
  const theme = useTheme();
  const colors = {
    paid: theme.palette.success,
    partial: theme.palette.warning,
    unpaid: theme.palette.error,
    completed: theme.palette.success,
    pending: theme.palette.warning,
  };
  
  // Default to 'unpaid' if status is undefined or null
  const statusKey = status || 'unpaid';
  const color = colors[statusKey] || theme.palette.grey;
  
  return (
    <Chip
      label={label || 'Unknown'}
      icon={icon}
      sx={{
        backgroundColor: alpha(color.main, 0.1),
        color: color.main,
        fontWeight: 600,
        '& .MuiChip-icon': {
          color: color.main,
        },
      }}
      size="small"
    />
  );
};

// ==================== MAIN COMPONENT ====================
const SupplierVikunumReport = () => {
  const theme = useTheme();
  
  // ==================== STATE ====================
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [paymentMethodBreakdown, setPaymentMethodBreakdown] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    useHistory: false,
    startDate: null,
    endDate: null,
    supplierCode: '',
    paymentType: 'all',
    status: 'all',
  });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [expandedRows, setExpandedRows] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('table');
  const [paymentTypes] = useState(['Cash', 'Cheque', 'Bank Transfer', 'bag_to_box', 'bill_to_bill', 'bad_debt']);
  const [statusOptions] = useState([
    { value: 'all', label: 'All Status' },
    { value: 'paid', label: 'Fully Paid' },
    { value: 'partial', label: 'Partially Paid' },
    { value: 'unpaid', label: 'Unpaid' },
  ]);

  // ==================== HELPER FUNCTIONS (MOVED BEFORE useMemo) ====================
  const getStatusKey = useCallback((item) => {
    if (!item) return 'unpaid';
    if (item.is_fully_paid) return 'paid';
    if (item.total_paid_excluding_credit > 0) return 'partial';
    return 'unpaid';
  }, []);

  const getStatusLabel = useCallback((item) => {
    if (!item) return 'Unknown';
    if (item.is_fully_paid) return 'Fully Paid';
    if (item.total_paid_excluding_credit > 0) return 'Partial';
    return 'Unpaid';
  }, []);

  const getStatusColor = useCallback((item) => {
    if (!item) return 'error';
    if (item.is_fully_paid) return 'success';
    if (item.total_paid_excluding_credit > 0) return 'warning';
    return 'error';
  }, []);

  // ==================== API CALLS ====================
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.useHistory) params.append('use_history', 'true');
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        if (isValid(start)) {
          params.append('start_date', format(start, 'yyyy-MM-dd'));
        }
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        if (isValid(end)) {
          params.append('end_date', format(end, 'yyyy-MM-dd'));
        }
      }
      if (filters.supplierCode) params.append('supplier_code', filters.supplierCode);
      if (filters.paymentType && filters.paymentType !== 'all') {
        params.append('payment_type', filters.paymentType);
      }
      if (filters.status && filters.status !== 'all') {
        params.append('status', filters.status);
      }

      const response = await api.get(`/supplier-loans/comprehensive-report?${params.toString()}`);
      
      if (response.data.success) {
        setReportData(response.data.data || []);
        setSummary(response.data.summary || null);
        setPaymentMethodBreakdown(response.data.payment_method_breakdown || {});
        if (response.data.suppliers) {
          setSuppliers(response.data.suppliers);
        }
      } else {
        setError(response.data.message || 'Failed to fetch report data');
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      setError(error.response?.data?.message || error.message || 'Failed to fetch report data');
      setReportData([]);
      setSummary(null);
      setPaymentMethodBreakdown({});
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // ==================== FILTERED & PAGINATED DATA ====================
  const filteredData = useMemo(() => {
    let data = reportData;
    
    // Apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      data = data.filter(item => {
        return (
          (item.supplier_code && item.supplier_code.toLowerCase().includes(term)) ||
          (item.supplier_name && item.supplier_name.toLowerCase().includes(term)) ||
          (item.bill_no && item.bill_no.toLowerCase().includes(term)) ||
          (item.creditor_no && item.creditor_no.toLowerCase().includes(term)) ||
          (item.supplier_creditor_no && item.supplier_creditor_no.toLowerCase().includes(term)) ||
          (item.notes && item.notes.toLowerCase().includes(term))
        );
      });
    }
    
    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      data = data.filter(item => {
        const statusKey = getStatusKey(item);
        return statusKey === filters.status;
      });
    }
    
    return data;
  }, [reportData, searchTerm, filters.status, getStatusKey]);

  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    const end = start + rowsPerPage;
    return filteredData.slice(start, end);
  }, [filteredData, page, rowsPerPage]);

  // ==================== HANDLERS ====================
  const toggleExpandRow = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleViewDetails = (item) => {
    setSelectedReport(item);
    setDetailDialogOpen(true);
  };

  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // ==================== EXPORT FUNCTIONS ====================
  const handleExportPDF = () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.text('Supplier Loan Report', pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageWidth / 2, 22, { align: 'center' });
    
    let filterText = '';
    if (filters.startDate && filters.endDate) {
      filterText += `Period: ${format(new Date(filters.startDate), 'dd/MM/yyyy')} - ${format(new Date(filters.endDate), 'dd/MM/yyyy')}`;
    }
    if (filters.supplierCode) {
      filterText += (filterText ? ' | ' : '') + `Supplier: ${filters.supplierCode}`;
    }
    if (filters.paymentType && filters.paymentType !== 'all') {
      filterText += (filterText ? ' | ' : '') + `Type: ${filters.paymentType}`;
    }
    if (filters.status && filters.status !== 'all') {
      const statusLabel = statusOptions.find(s => s.value === filters.status)?.label || filters.status;
      filterText += (filterText ? ' | ' : '') + `Status: ${statusLabel}`;
    }
    if (filterText) {
      doc.setFontSize(9);
      doc.text(filterText, pageWidth / 2, 28, { align: 'center' });
    }
    
    if (summary) {
      doc.setFontSize(10);
      const stats = [
        `Total Bills: ${summary.total_loans || 0}`,
        `Total Amount: ${(summary.total_bill_amount || 0).toFixed(2)}`,
        `Total Paid: ${(summary.total_paid || 0).toFixed(2)}`,
        `Total Remaining: ${(summary.total_remaining || 0).toFixed(2)}`,
        `Fully Paid: ${summary.fully_paid_count || 0}`,
        `Partially Paid: ${summary.partially_paid_count || 0}`,
      ];
      doc.text(stats.join(' | '), pageWidth / 2, 34, { align: 'center' });
    }
    
    const tableColumn = [
      'Supplier',
      'Bill No',
      'Type',
      'Bill Total',
      'Paid',
      'Credit',
      'Remaining',
      'Date',
      'Status',
    ];
    
    const tableRows = filteredData.map(item => [
      `${item.supplier_code || ''} - ${item.supplier_name || ''}`,
      item.bill_no || '',
      item.payment_type_display || item.payment_type || '',
      (item.bill_total || 0).toFixed(2),
      (item.total_paid_excluding_credit || 0).toFixed(2),
      (item.total_credit_amount || 0).toFixed(2),
      (item.remaining_amount || 0).toFixed(2),
      item.date ? format(new Date(item.date), 'dd/MM/yyyy') : '',
      item.is_fully_paid ? 'Paid' : item.total_paid_excluding_credit > 0 ? 'Partial' : 'Unpaid',
    ]);
    
    doc.autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 40,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185], textColor: [255, 255, 255], fontSize: 9 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 10, right: 10 },
    });
    
    doc.save(`Supplier_Loan_Report_${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  const handleExportExcel = () => {
    const excelData = filteredData.map(item => ({
      'Supplier Code': item.supplier_code || '',
      'Supplier Name': item.supplier_name || '',
      'Creditor No': item.supplier_creditor_no || item.Creditor_no || '',
      'Bill No': item.bill_no || '',
      'Bill Total': item.bill_total || 0,
      'Total Paid (Excl Credit)': item.total_paid_excluding_credit || 0,
      'Total Credit Amount': item.total_credit_amount || 0,
      'Total Paid (Incl Credit)': item.total_paid_including_credit || 0,
      'Remaining Amount': item.remaining_amount || 0,
      'Payment Type': item.payment_type_display || item.payment_type || '',
      'Date': item.date || '',
      'Status': item.is_fully_paid ? 'Fully Paid' : item.total_paid_excluding_credit > 0 ? 'Partial' : 'Unpaid',
      'Cashier': item.cashier_name || '',
      'Notes': item.notes || '',
      'Bank Name': item.bank_name || '',
      'Cheque No': item.cheque_no || '',
      'Transfer Ref': item.transfer_reference_no || '',
      'Bag Count': item.bag_count || 0,
      'Box Count': item.box_count || 0,
      'Bag Amount': item.bag_amount || 0,
      'Bad Debt Name': item.bad_debt_name || '',
      'Bad Debt Amount': item.bad_debt_amount || 0,
    }));
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(wb, ws, 'Supplier Loans');
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob, `Supplier_Loan_Report_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // ==================== RENDER FUNCTIONS ====================
  const renderPaymentBreakdown = () => {
    if (!paymentMethodBreakdown || Object.keys(paymentMethodBreakdown).length === 0) {
      return <Typography variant="body2" color="textSecondary">No payment data</Typography>;
    }
    
    const total = Object.values(paymentMethodBreakdown).reduce((a, b) => a + b, 0);
    
    return (
      <Box>
        {Object.entries(paymentMethodBreakdown).map(([method, amount]) => (
          <Box key={method} sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PaymentMethodIcon method={method} />
                <Typography variant="body2">{method}</Typography>
              </Box>
              <Typography variant="body2" fontWeight="bold">
                Rs. {amount.toFixed(2)}
                <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                  ({total > 0 ? ((amount / total) * 100).toFixed(1) : 0}%)
                </Typography>
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={total > 0 ? (amount / total) * 100 : 0}
              sx={{ height: 6, borderRadius: 3 }}
            />
          </Box>
        ))}
      </Box>
    );
  };

  const renderDetailDialog = () => {
    if (!selectedReport) return null;
    
    const payments = selectedReport.payment_details || [];
    const paymentsByMethod = selectedReport.payments_by_method || {};
    
    return (
      <Dialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              Payment Details - {selectedReport.bill_no}
            </Typography>
            <Box>
              <Chip
                label={getStatusLabel(selectedReport)}
                color={getStatusColor(selectedReport)}
                size="small"
              />
            </Box>
          </Box>
          <Typography variant="subtitle2" color="textSecondary">
            {selectedReport.supplier_code} - {selectedReport.supplier_name}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="textSecondary">Bill Total</Typography>
              <Typography variant="h6" color="primary">Rs. {(selectedReport.bill_total || 0).toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="textSecondary">Paid (Excl Credit)</Typography>
              <Typography variant="h6" color="success.main">Rs. {(selectedReport.total_paid_excluding_credit || 0).toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="textSecondary">Credit Amount</Typography>
              <Typography variant="h6" color="warning.main">Rs. {(selectedReport.total_credit_amount || 0).toFixed(2)}</Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="caption" color="textSecondary">Remaining</Typography>
              <Typography variant="h6" color="error.main">Rs. {(selectedReport.remaining_amount || 0).toFixed(2)}</Typography>
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 2 }} />
          
          <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
            Payment Methods Breakdown
          </Typography>
          <Grid container spacing={2} sx={{ mb: 2 }}>
            {Object.entries(paymentsByMethod).map(([method, amount]) => (
              <Grid item xs={12} sm={6} key={method}>
                <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PaymentMethodIcon method={method} />
                    <Typography variant="body2">{method}</Typography>
                  </Box>
                  <Typography variant="body2" fontWeight="bold">Rs. {amount.toFixed(2)}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          
          {payments.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Individual Payments ({payments.length})
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Method</TableCell>
                      <TableCell>Amount</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Reference</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.map((payment, index) => (
                      <TableRow key={index}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <PaymentMethodChip method={payment.method} />
                        </TableCell>
                        <TableCell>Rs. {(payment.amount || 0).toFixed(2)}</TableCell>
                        <TableCell>{payment.date || '-'}</TableCell>
                        <TableCell>
                          {payment.cheque_no || payment.transfer_reference_no || payment.reference || payment.id || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
          
          {selectedReport.notes && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="textSecondary">Notes</Typography>
              <Typography variant="body2">{selectedReport.notes}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailDialogOpen(false)}>Close</Button>
          <Button
            variant="contained"
            startIcon={<Print />}
            onClick={() => window.print()}
          >
            Print
          </Button>
        </DialogActions>
      </Dialog>
    );
  };

  const renderTableView = () => (
    <TableContainer component={Paper} sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Table stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ minWidth: 40 }} />
            <TableCell sx={{ fontWeight: 'bold' }}>Supplier</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Bill No</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }} align="right">Bill Total</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }} align="right">Paid</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }} align="right">Remaining</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Date</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 'bold' }} align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {paginatedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                <Typography variant="body1" color="textSecondary">
                  No records found
                </Typography>
              </TableCell>
            </TableRow>
          ) : (
            paginatedData.map((item) => (
              <React.Fragment key={item.id || item.bill_no}>
                <TableRow hover>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => toggleExpandRow(item.id)}
                    >
                      {expandedRows[item.id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                    </IconButton>
                  </TableCell>
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight="500">
                        {item.supplier_code}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {item.supplier_name}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{item.bill_no}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {item.supplier_creditor_no && `Creditor: ${item.supplier_creditor_no}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <PaymentMethodChip method={item.payment_type} />
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="500">
                      Rs. {(item.bill_total || 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" color="success.main" fontWeight="500">
                      Rs. {(item.total_paid_excluding_credit || 0).toFixed(2)}
                    </Typography>
                    {item.total_credit_amount > 0 && (
                      <Typography variant="caption" color="warning.main">
                        + Credit: Rs. {(item.total_credit_amount || 0).toFixed(2)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      fontWeight="500"
                      color={item.remaining_amount > 0 ? 'error.main' : 'success.main'}
                    >
                      Rs. {(item.remaining_amount || 0).toFixed(2)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {item.date ? format(new Date(item.date), 'dd/MM/yyyy') : '-'}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {item.cashier_name && `By: ${item.cashier_name}`}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusChipComponent
                      status={getStatusKey(item)}
                      label={getStatusLabel(item)}
                      icon={item.is_fully_paid ? <CheckCircle /> : <Warning />}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <span>
                        <IconButton
                          size="small"
                          onClick={() => handleViewDetails(item)}
                          color="primary"
                        >
                          <Visibility />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={10} sx={{ py: 0 }}>
                    <Collapse in={Boolean(expandedRows[item.id])} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 3, backgroundColor: alpha(theme.palette.primary.light, 0.04) }}>
                        <Grid container spacing={2}>
                          <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" gutterBottom>
                              Payment Details
                            </Typography>
                            {item.payment_details && item.payment_details.length > 0 ? (
                              <Box sx={{ maxHeight: 200, overflow: 'auto' }}>
                                {item.payment_details.map((payment, idx) => (
                                  <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <PaymentMethodIcon method={payment.method} />
                                      <Typography variant="body2">{payment.method}</Typography>
                                    </Box>
                                    <Typography variant="body2">Rs. {(payment.amount || 0).toFixed(2)}</Typography>
                                  </Box>
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="textSecondary">No individual payments</Typography>
                            )}
                          </Grid>
                          <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" gutterBottom>
                              Additional Info
                            </Typography>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              {item.bank_name && (
                                <Typography variant="body2"><strong>Bank:</strong> {item.bank_name}</Typography>
                              )}
                              {item.cheque_no && (
                                <Typography variant="body2"><strong>Cheque No:</strong> {item.cheque_no}</Typography>
                              )}
                              {item.transfer_reference_no && (
                                <Typography variant="body2"><strong>Transfer Ref:</strong> {item.transfer_reference_no}</Typography>
                              )}
                              {item.bag_count > 0 && (
                                <Typography variant="body2"><strong>Bags:</strong> {item.bag_count}</Typography>
                              )}
                              {item.box_count > 0 && (
                                <Typography variant="body2"><strong>Boxes:</strong> {item.box_count}</Typography>
                              )}
                              {item.bad_debt_name && (
                                <Typography variant="body2"><strong>Bad Debt:</strong> {item.bad_debt_name}</Typography>
                              )}
                              {item.bag_amount !== null && item.bag_amount !== undefined && (
                                <Typography variant="body2"><strong>Bag Amount:</strong> Rs. {Number(item.bag_amount).toFixed(2)}</Typography>
                              )}
                            </Box>
                            {item.notes && (
                              <Typography variant="body2" sx={{ mt: 1 }}>
                                <strong>Notes:</strong> {item.notes}
                              </Typography>
                            )}
                          </Grid>
                        </Grid>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={filteredData.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
      />
    </TableContainer>
  );

  const renderCardView = () => (
    <Grid container spacing={3}>
      {paginatedData.length === 0 ? (
        <Grid item xs={12}>
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="textSecondary">No records found</Typography>
          </Paper>
        </Grid>
      ) : (
        paginatedData.map((item) => (
          <Grid item xs={12} sm={6} lg={4} key={item.id || item.bill_no}>
            <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2 }}>
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {item.supplier_code}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {item.supplier_name}
                    </Typography>
                  </Box>
                  <StatusChipComponent
                    status={getStatusKey(item)}
                    label={getStatusLabel(item)}
                    size="small"
                  />
                </Box>
                
                <Divider sx={{ my: 1.5 }} />
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="textSecondary">Bill No:</Typography>
                  <Typography variant="body2" fontWeight="500">{item.bill_no}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="textSecondary">Type:</Typography>
                  <PaymentMethodChip method={item.payment_type} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="textSecondary">Date:</Typography>
                  <Typography variant="body2">{item.date ? format(new Date(item.date), 'dd/MM/yyyy') : '-'}</Typography>
                </Box>
                
                <Divider sx={{ my: 1.5 }} />
                
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box>
                    <Typography variant="caption" color="textSecondary">Bill Total</Typography>
                    <Typography variant="body2" fontWeight="bold" color="primary">Rs. {(item.bill_total || 0).toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">Paid</Typography>
                    <Typography variant="body2" fontWeight="bold" color="success.main">Rs. {(item.total_paid_excluding_credit || 0).toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">Credit</Typography>
                    <Typography variant="body2" fontWeight="bold" color="warning.main">Rs. {(item.total_credit_amount || 0).toFixed(2)}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="textSecondary">Remaining</Typography>
                    <Typography variant="body2" fontWeight="bold" color="error.main">Rs. {(item.remaining_amount || 0).toFixed(2)}</Typography>
                  </Box>
                </Box>
              </CardContent>
              <CardActions sx={{ justifyContent: 'flex-end', p: 2, pt: 0 }}>
                <Button
                  size="small"
                  startIcon={<Visibility />}
                  onClick={() => handleViewDetails(item)}
                >
                  View Details
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))
      )}
    </Grid>
  );

  const renderSummaryView = () => {
    if (!summary) return null;
    
    const statCards = [
      {
        title: 'Total Bills',
        value: summary.total_loans || 0,
        icon: <Receipt />,
        color: theme.palette.info.main,
      },
      {
        title: 'Total Bill Amount',
        value: `Rs. ${(summary.total_bill_amount || 0).toFixed(2)}`,
        icon: <AttachMoney />,
        color: theme.palette.primary.main,
      },
      {
        title: 'Total Paid',
        value: `Rs. ${(summary.total_paid || 0).toFixed(2)}`,
        icon: <Payment />,
        color: theme.palette.success.main,
      },
      {
        title: 'Total Credit',
        value: `Rs. ${(summary.total_credit_amount || 0).toFixed(2)}`,
        icon: <AccountBalanceWallet />,
        color: theme.palette.warning.main,
      },
      {
        title: 'Total Remaining',
        value: `Rs. ${(summary.total_remaining || 0).toFixed(2)}`,
        icon: <TrendingDown />,
        color: theme.palette.error.main,
      },
      {
        title: 'Fully Paid',
        value: summary.fully_paid_count || 0,
        icon: <CheckCircle />,
        color: theme.palette.success.main,
      },
      {
        title: 'Partially Paid',
        value: summary.partially_paid_count || 0,
        icon: <Warning />,
        color: theme.palette.warning.main,
      },
      {
        title: 'Unpaid',
        value: summary.unpaid_count || 0,
        icon: <Cancel />,
        color: theme.palette.error.main,
      },
    ];
    
    return (
      <Box>
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {statCards.map((stat, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <StyledStatCard>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="caption" color="textSecondary">{stat.title}</Typography>
                      <Typography variant="h5" fontWeight="bold">{stat.value}</Typography>
                    </Box>
                    <Avatar sx={{ bgcolor: alpha(stat.color, 0.2), color: stat.color }}>
                      {stat.icon}
                    </Avatar>
                  </Box>
                </CardContent>
              </StyledStatCard>
            </Grid>
          ))}
        </Grid>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Payment Method Breakdown
              </Typography>
              <Box sx={{ mt: 2 }}>
                {renderPaymentBreakdown()}
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, borderRadius: 2 }}>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Status Distribution
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Fully Paid</Typography>
                  <Typography variant="body2" fontWeight="bold" color="success.main">
                    {summary.fully_paid_count || 0} ({summary.total_loans > 0 ? ((summary.fully_paid_count / summary.total_loans) * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={summary.total_loans > 0 ? (summary.fully_paid_count / summary.total_loans) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4, mb: 2, bgcolor: alpha(theme.palette.success.main, 0.2) }}
                  color="success"
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Partially Paid</Typography>
                  <Typography variant="body2" fontWeight="bold" color="warning.main">
                    {summary.partially_paid_count || 0} ({summary.total_loans > 0 ? ((summary.partially_paid_count / summary.total_loans) * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={summary.total_loans > 0 ? (summary.partially_paid_count / summary.total_loans) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4, mb: 2, bgcolor: alpha(theme.palette.warning.main, 0.2) }}
                  color="warning"
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Unpaid</Typography>
                  <Typography variant="body2" fontWeight="bold" color="error.main">
                    {summary.unpaid_count || 0} ({summary.total_loans > 0 ? ((summary.unpaid_count / summary.total_loans) * 100).toFixed(1) : 0}%)
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={summary.total_loans > 0 ? (summary.unpaid_count / summary.total_loans) * 100 : 0}
                  sx={{ height: 8, borderRadius: 4, mb: 2, bgcolor: alpha(theme.palette.error.main, 0.2) }}
                  color="error"
                />
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    );
  };

  // ==================== MAIN RENDER ====================
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="xl" sx={{ py: 3 }}>
        <GradientHeader>
          <Box>
            <Typography variant="h4" fontWeight="bold">
              Supplier Loan Report
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8 }}>
              Comprehensive view of all supplier loan payments
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Tooltip title="Refresh Data">
              <span>
                <IconButton color="inherit" onClick={fetchReport} disabled={loading}>
                  <Refresh />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Export to PDF">
              <span>
                <IconButton color="inherit" onClick={handleExportPDF}>
                  <Print />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Export to Excel">
              <span>
                <IconButton color="inherit" onClick={handleExportExcel}>
                  <FileCopy />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </GradientHeader>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <StyledPaper>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={2}>
              <FormControlLabel
                control={
                  <Switch
                    checked={filters.useHistory}
                    onChange={(e) => setFilters(prev => ({ ...prev, useHistory: e.target.checked }))}
                    color="primary"
                  />
                }
                label="Use History"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={1.5}>
              <DatePicker
                label="Start Date"
                value={filters.startDate}
                onChange={(date) => setFilters(prev => ({ ...prev, startDate: date }))}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={1.5}>
              <DatePicker
                label="End Date"
                value={filters.endDate}
                onChange={(date) => setFilters(prev => ({ ...prev, endDate: date }))}
                slotProps={{ textField: { fullWidth: true, size: 'small' } }}
              />
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Supplier</InputLabel>
                <Select
                  value={filters.supplierCode}
                  label="Supplier"
                  onChange={(e) => setFilters(prev => ({ ...prev, supplierCode: e.target.value }))}
                >
                  <MenuItem value="">All</MenuItem>
                  {suppliers.map((supplier) => (
                    <MenuItem key={supplier.id || supplier.code} value={supplier.code}>
                      {supplier.code}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Payment Type</InputLabel>
                <Select
                  value={filters.paymentType}
                  label="Payment Type"
                  onChange={(e) => setFilters(prev => ({ ...prev, paymentType: e.target.value }))}
                >
                  <MenuItem value="all">All Types</MenuItem>
                  {paymentTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1.5}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={filters.status}
                  label="Status"
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={1}>
              <Button
                variant="contained"
                fullWidth
                onClick={fetchReport}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <Search />}
              >
                {loading ? 'Loading' : 'Apply'}
              </Button>
            </Grid>
          </Grid>
        </StyledPaper>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <TextField
              placeholder="Search by supplier, bill no, creditor no..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              size="small"
              sx={{ width: 300 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <Search />
                    </InputAdornment>
                  ),
                  endAdornment: searchTerm && (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchTerm('')}>
                        <Clear />
                      </IconButton>
                    </InputAdornment>
                  ),
                }
              }}
            />
            <Typography variant="caption" color="textSecondary">
              {filteredData.length} records found
            </Typography>
            {filters.status !== 'all' && (
              <Chip
                label={`Status: ${statusOptions.find(s => s.value === filters.status)?.label || filters.status}`}
                onDelete={() => setFilters(prev => ({ ...prev, status: 'all' }))}
                size="small"
                color="primary"
              />
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <ToggleButton
              value="summary"
              selected={viewMode === 'summary'}
              onChange={setViewMode}
            >
              Summary
            </ToggleButton>
            <ToggleButton
              value="table"
              selected={viewMode === 'table'}
              onChange={setViewMode}
            >
              Table
            </ToggleButton>
            <ToggleButton
              value="card"
              selected={viewMode === 'card'}
              onChange={setViewMode}
            >
              Cards
            </ToggleButton>
          </Box>
        </Box>

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && (
          <>
            {viewMode === 'summary' && renderSummaryView()}
            {viewMode === 'table' && renderTableView()}
            {viewMode === 'card' && renderCardView()}
          </>
        )}

        {renderDetailDialog()}
      </Container>
    </LocalizationProvider>
  );
};

export default SupplierVikunumReport;