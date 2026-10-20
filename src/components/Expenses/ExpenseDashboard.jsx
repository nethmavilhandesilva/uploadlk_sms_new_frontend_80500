import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Container,
  Grid,
  Paper,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
  Box,
  Pagination,
  Avatar,
  Stack,
  ThemeProvider,
  createTheme,
  CssBaseline,
  GlobalStyles
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  LocalAtm as LocalAtmIcon,
  CreditCard as CreditCardIcon,
  AccountBalanceWallet as AccountBalanceWalletIcon,
  ArrowBack as ArrowBackIcon,
  Category as CategoryIcon
} from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import api from '../../api';

// Create a dark theme with full-width overrides
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#818cf8',
    },
    secondary: {
      main: '#f472b6',
    },
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiContainer: {
      styleOverrides: {
        root: {
          maxWidth: '100% !important',
          paddingLeft: '0 !important',
          paddingRight: '0 !important',
          margin: '0 !important',
          width: '100% !important',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          width: '100%',
        },
      },
    },
    MuiGrid: {
      styleOverrides: {
        root: {
          width: '100%',
          margin: '0',
        },
        container: {
          width: '100%',
          margin: '0',
        },
      },
    },
  },
});

// Global styles to override any existing styles
const globalStyles = {
  '*': {
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  },
  'html, body, #root': {
    height: '100%',
    width: '100%',
    margin: 0,
    padding: 0,
  },
  '.MuiContainer-root': {
    maxWidth: '100% !important',
    paddingLeft: '0 !important',
    paddingRight: '0 !important',
  },
  '.MuiPaper-root': {
    width: '100% !important',
  },
  // Fix for input autofill styles - THIS IS CRITICAL
  'input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus, input:-webkit-autofill:active': {
    WebkitBoxShadow: '0 0 0 100px rgba(15, 23, 42, 0.9) inset !important',
    WebkitTextFillColor: '#e2e8f0 !important',
    backgroundColor: 'rgba(15, 23, 42, 0.9) !important',
    caretColor: '#e2e8f0 !important',
  },
  // Force all input backgrounds to stay dark
  '.MuiInputBase-root, .MuiOutlinedInput-root, .MuiFilledInput-root, .MuiInput-root': {
    backgroundColor: 'rgba(15, 23, 42, 0.6) !important',
    '& input': {
      backgroundColor: 'transparent !important',
      color: '#e2e8f0 !important',
    },
    '& textarea': {
      backgroundColor: 'transparent !important',
      color: '#e2e8f0 !important',
    },
    '&:hover': {
      backgroundColor: 'rgba(15, 23, 42, 0.7) !important',
    },
    '&.Mui-focused': {
      backgroundColor: 'rgba(15, 23, 42, 0.8) !important',
    },
  },
  // Ensure form controls have dark background
  '.MuiFormControl-root': {
    '& .MuiInputBase-root': {
      backgroundColor: 'rgba(15, 23, 42, 0.6) !important',
    },
  },
  // Fix for select dropdown
  '.MuiMenu-paper': {
    backgroundColor: '#1e293b !important',
    backgroundImage: 'none !important',
  },
  '.MuiMenuItem-root': {
    color: '#e2e8f0 !important',
    '&:hover': {
      backgroundColor: 'rgba(129, 140, 248, 0.1) !important',
    },
    '&.Mui-selected': {
      backgroundColor: 'rgba(129, 140, 248, 0.2) !important',
      '&:hover': {
        backgroundColor: 'rgba(129, 140, 248, 0.3) !important',
      },
    },
  },
  // Fix for date picker popup
  '.MuiPickersPopper-paper': {
    backgroundColor: '#1e293b !important',
    backgroundImage: 'none !important',
  },
  '.MuiClockPicker-container': {
    backgroundColor: '#1e293b !important',
  },
  '.MuiPickersDay-root': {
    color: '#e2e8f0 !important',
    '&.Mui-selected': {
      backgroundColor: '#818cf8 !important',
    },
    '&:hover': {
      backgroundColor: 'rgba(129, 140, 248, 0.1) !important',
    },
  },
  '.MuiDialog-paper': {
    backgroundImage: 'none !important',
  },
  // Override any white backgrounds on focus
  '.MuiOutlinedInput-root.Mui-focused': {
    backgroundColor: 'rgba(15, 23, 42, 0.8) !important',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#818cf8 !important',
    },
  },
  '.MuiInputBase-root.Mui-focused': {
    backgroundColor: 'rgba(15, 23, 42, 0.8) !important',
  },
  // Prevent white background on any input focus
  'input:focus, textarea:focus, .Mui-focused input, .Mui-focused textarea': {
    backgroundColor: 'transparent !important',
  },
};

const ExpenseDashboard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedCashier, setSelectedCashier] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({
    total: 0,
    monthly: 0,
    today: 0,
    cash: 0,
    cheque: 0,
    bankTransfer: 0
  });
  const [formData, setFormData] = useState({
    expense_type_id: '',
    date: dayjs(),
    name: '',
    amount: '',
    payment_method: 'cash',
    cheque_no: '',
    cheque_date: null,
    cheque_bank_account_no: '',
    ref_no: '',
    bank_transfer_account_no: '',
    transfer_date: null
  });
  const [errors, setErrors] = useState({});
  const [successMessage, setSuccessMessage] = useState('');

  // Get the selected cashier from navigation state
  useEffect(() => {
    if (location.state && location.state.selectedCashier) {
      const cashier = location.state.selectedCashier;
      setSelectedCashier(cashier);
      console.log('📋 Selected Cashier from PrintedBills:', cashier);
    }
  }, [location.state]);

  useEffect(() => {
    fetchExpenseTypes();
    fetchBanks();
    fetchExpenses();
  }, [page]);

  const fetchExpenseTypes = async () => {
    try {
      const response = await api.get('/utility-types/expense');
      if (response.data.success) setExpenseTypes(response.data.data);
    } catch (error) {
      console.error('Error fetching expense types:', error);
    }
  };

  const fetchBanks = async () => {
    try {
      const response = await api.get('/banks/list');
      if (response.data.success) setBanks(response.data.data);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/expenses?page=${page}`);
      if (response.data.success) {
        setExpenses(response.data.expenses.data);
        setTotalPages(response.data.expenses.last_page);

        const dashboardResponse = await api.get('/expenses/dashboard');
        if (dashboardResponse.data.success) setStats(dashboardResponse.data.stats);
      }
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: '' });
  };

  const handleDateChange = (name, value) => {
    setFormData({ ...formData, [name]: value });
  };

  const handlePaymentMethodChange = (e) => {
    const method = e.target.value;
    setFormData({
      ...formData,
      payment_method: method,
      cheque_no: '',
      cheque_date: null,
      cheque_bank_account_no: '',
      ref_no: '',
      bank_transfer_account_no: '',
      transfer_date: null
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    try {
      const submitData = {
        ...formData,
        date: formData.date.format('YYYY-MM-DD'),
        cheque_date: formData.cheque_date ? formData.cheque_date.format('YYYY-MM-DD') : null,
        transfer_date: formData.transfer_date ? formData.transfer_date.format('YYYY-MM-DD') : null,
        cashier_name: selectedCashier // Add the selected cashier here
      };

      let response;
      if (editExpense) {
        response = await api.put(`/expenses/${editExpense.id}`, submitData);
      } else {
        response = await api.post('/expenses/store', submitData);
      }

      if (response.data.success) {
        setSuccessMessage(response.data.message);
        resetForm();
        fetchExpenses();
        setTimeout(() => {
          setOpenDialog(false);
          setSuccessMessage('');
        }, 2000);
      }
    } catch (error) {
      if (error.response?.data?.errors) {
        setErrors(error.response.data.errors);
      } else {
        alert(error.response?.data?.message || 'Error saving expense');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this expense?')) {
      try {
        const response = await api.delete(`/expenses/${id}`);
        if (response.data.success) {
          fetchExpenses();
          setSuccessMessage('Expense deleted successfully');
          setTimeout(() => setSuccessMessage(''), 3000);
        }
      } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Error deleting expense');
      }
    }
  };

  const handleEdit = (expense) => {
    setEditExpense(expense);
    setFormData({
      expense_type_id: expense.expense_type_id || '',
      date: dayjs(expense.date),
      name: expense.name || '',
      amount: expense.amount || '',
      payment_method: expense.payment_method || 'cash',
      cheque_no: expense.cheque_no || '',
      cheque_date: expense.cheque_date ? dayjs(expense.cheque_date) : null,
      cheque_bank_account_no: expense.cheque_bank_account_no || '',
      ref_no: expense.ref_no || '',
      bank_transfer_account_no: expense.bank_transfer_account_no || '',
      transfer_date: expense.transfer_date ? dayjs(expense.transfer_date) : null
    });
    setOpenDialog(true);
  };

  const resetForm = () => {
    setEditExpense(null);
    setFormData({
      expense_type_id: '',
      date: dayjs(),
      name: '',
      amount: '',
      payment_method: 'cash',
      cheque_no: '',
      cheque_date: null,
      cheque_bank_account_no: '',
      ref_no: '',
      bank_transfer_account_no: '',
      transfer_date: null
    });
    setErrors({});
  };

  // Navigation handlers
  const handleBack = () => {
    navigate('/printed-bills');
  };

  const handleExpenseTypes = () => {
    navigate('/utility-types');
  };

  const renderConditionalFields = () => {
    if (formData.payment_method === 'cheque') {
      return (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Cheque Number"
              name="cheque_no"
              value={formData.cheque_no}
              onChange={handleInputChange}
              required
              error={!!errors.cheque_no}
              helperText={errors.cheque_no}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <DatePicker
              label="Cheque Date"
              value={formData.cheque_date}
              onChange={(value) => handleDateChange('cheque_date', value)}
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControl fullWidth required>
              <InputLabel>Bank Account</InputLabel>
              <Select
                name="cheque_bank_account_no"
                value={formData.cheque_bank_account_no}
                onChange={handleInputChange}
                label="Bank Account"
              >
                {banks.map((bank) => (
                  <MenuItem key={bank.id} value={bank.account_no}>
                    {bank.bank_name} - {bank.account_no}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      );
    }

    if (formData.payment_method === 'bank_transfer') {
      return (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Reference Number"
              name="ref_no"
              value={formData.ref_no}
              onChange={handleInputChange}
              required
              error={!!errors.ref_no}
              helperText={errors.ref_no}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Bank Account Number"
              name="bank_transfer_account_no"
              value={formData.bank_transfer_account_no}
              onChange={handleInputChange}
              required
              error={!!errors.bank_transfer_account_no}
              helperText={errors.bank_transfer_account_no}
            />
          </Grid>
          <Grid item xs={12}>
            <DatePicker
              label="Transfer Date"
              value={formData.transfer_date}
              onChange={(value) => handleDateChange('transfer_date', value)}
              slotProps={{ textField: { fullWidth: true, required: true } }}
            />
          </Grid>
        </Grid>
      );
    }

    return null;
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <GlobalStyles styles={globalStyles} />
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <Box sx={{
          minHeight: '100vh',
          width: '100vw',
          maxWidth: '100%',
          background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
          position: 'relative',
          overflowX: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.08) 0%, transparent 50%)',
            pointerEvents: 'none'
          }
        }}>
          {/* Full width content with no padding */}
          <Box sx={{
            px: { xs: 2, sm: 3, md: 4 },
            py: 4,
            position: 'relative',
            zIndex: 1,
            width: '100%',
            maxWidth: '100%'
          }}>
            {/* Modern Header - Full Width */}
            <Paper elevation={0} sx={{
              p: 4,
              mb: 4,
              borderRadius: '28px',
              background: 'rgba(30,41,59,0.8)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              width: '100%'
            }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <Box>
                  <Typography variant="h4" sx={{
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #a5b4fc 0%, #c084fc 100%)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    mb: 1
                  }}>
                    Expense Dashboard
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                    Track, manage, and analyze your expenses efficiently
                  </Typography>
                  {/* Display selected cashier if available */}
                  
                  {selectedCashier && (
                    <Typography variant="caption" sx={{
                      color: '#60a5fa',
                      display: 'inline-block',
                      mt: 1,
                      background: 'rgba(96,165,250,0.1)',
                      padding: '4px 8px',
                      borderRadius: '8px'
                    }}>
                      👤 Cashier: {selectedCashier}
                    </Typography>
                  )}
                </Box>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="outlined"
                    startIcon={<ArrowBackIcon />}
                    onClick={handleBack}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      px: 3,
                      borderColor: 'rgba(255,255,255,0.2)',
                      color: '#e2e8f0',
                      '&:hover': { borderColor: '#818cf8', bgcolor: 'rgba(129,140,248,0.08)' }
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<CategoryIcon />}
                    onClick={handleExpenseTypes}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      px: 3,
                      borderColor: 'rgba(255,255,255,0.2)',
                      color: '#e2e8f0',
                      '&:hover': { borderColor: '#818cf8', bgcolor: 'rgba(129,140,248,0.08)' }
                    }}
                  >
                    Expense Types
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchExpenses}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      px: 3,
                      borderColor: 'rgba(255,255,255,0.2)',
                      color: '#e2e8f0',
                      '&:hover': { borderColor: '#818cf8', bgcolor: 'rgba(129,140,248,0.08)' }
                    }}
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      resetForm();
                      setOpenDialog(true);
                    }}
                    sx={{
                      borderRadius: '14px',
                      textTransform: 'none',
                      px: 4,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      boxShadow: '0 4px 14px rgba(99,102,241,0.4)',
                      '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 6px 20px rgba(99,102,241,0.5)' },
                      transition: 'all 0.2s'
                    }}
                  >
                    Add Expense
                  </Button>
                </Stack>
              </Box>
            </Paper>

            {/* Success Message */}
            {successMessage && (
              <Alert
                severity="success"
                sx={{ mb: 3, borderRadius: '16px', background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', width: '100%' }}
                onClose={() => setSuccessMessage('')}
                icon={<CheckCircleIcon fontSize="inherit" />}
              >
                {successMessage}
              </Alert>
            )}

            {/* Payment Methods Summary Cards - Single Horizontal Line */}
            <Box sx={{ mb: 4, width: '100%', display: 'flex', gap: 3, flexDirection: 'row', flexWrap: 'nowrap' }}>
              <Paper sx={{
                p: 3,
                borderRadius: '20px',
                background: 'rgba(30,41,59,0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.3s',
                flex: 1,
                '&:hover': { transform: 'translateY(-4px)', background: 'rgba(30,41,59,0.8)' }
              }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Avatar sx={{ bgcolor: 'rgba(16,185,129,0.2)', width: 48, height: 48 }}>
                    <LocalAtmIcon sx={{ color: '#34d399' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#94a3b8', letterSpacing: '0.5px' }}>Cash Payments</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color: '#34d399', fontSize: '1.8rem' }}>
                      LKR {stats.cash.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              <Paper sx={{
                p: 3,
                borderRadius: '20px',
                background: 'rgba(30,41,59,0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.3s',
                flex: 1,
                '&:hover': { transform: 'translateY(-4px)', background: 'rgba(30,41,59,0.8)' }
              }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Avatar sx={{ bgcolor: 'rgba(59,130,246,0.2)', width: 48, height: 48 }}>
                    <CreditCardIcon sx={{ color: '#60a5fa' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#94a3b8', letterSpacing: '0.5px' }}>Cheque Payments</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color: '#60a5fa', fontSize: '1.8rem' }}>
                      LKR {stats.cheque.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              <Paper sx={{
                p: 3,
                borderRadius: '20px',
                background: 'rgba(30,41,59,0.6)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.08)',
                transition: 'all 0.3s',
                flex: 1,
                '&:hover': { transform: 'translateY(-4px)', background: 'rgba(30,41,59,0.8)' }
              }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Avatar sx={{ bgcolor: 'rgba(236,72,153,0.2)', width: 48, height: 48 }}>
                    <AccountBalanceWalletIcon sx={{ color: '#f472b6' }} />
                  </Avatar>
                  <Box>
                    <Typography variant="body2" sx={{ color: '#94a3b8', letterSpacing: '0.5px' }}>Bank Transfers</Typography>
                    <Typography variant="h4" fontWeight="bold" sx={{ color: '#f472b6', fontSize: '1.8rem' }}>
                      LKR {stats.bankTransfer.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            </Box>

            {/* Expenses Table - Full Width */}
            <Paper sx={{
              borderRadius: '24px',
              overflow: 'hidden',
              background: 'rgba(30,41,59,0.6)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              width: '100%'
            }}>
              <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography variant="h6" fontWeight="700" sx={{ color: '#f1f5f9' }}>
                  Expense History
                </Typography>
              </Box>
              <TableContainer sx={{ overflowX: 'auto', width: '100%' }}>
                <Table sx={{ minWidth: 800, width: '100%' }}>
                  <TableHead>
                    <TableRow sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Amount</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Payment Method</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                          <CircularProgress size={48} sx={{ color: '#818cf8' }} />
                        </TableCell>
                      </TableRow>
                    ) : expenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                          <Typography sx={{ color: '#64748b' }}>No expenses found</Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      expenses.map((expense) => (
                        <TableRow key={expense.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' }, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <TableCell sx={{ color: '#cbd5e1' }}>{dayjs(expense.date).format('YYYY-MM-DD')}</TableCell>
                          <TableCell>
                            <Chip
                              label={expense.utility_type?.name || 'N/A'}
                              size="small"
                              sx={{
                                borderRadius: '10px',
                                bgcolor: 'rgba(129,140,248,0.15)',
                                color: '#a5b4fc',
                                fontWeight: 500,
                                border: '1px solid rgba(129,140,248,0.3)'
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 500, color: '#e2e8f0' }}>{expense.name}</TableCell>
                          <TableCell>
                            <Typography fontWeight="700" sx={{ color: '#f87171' }}>
                              LKR {parseFloat(expense.amount).toFixed(2)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={expense.payment_method.replace('_', ' ').toUpperCase()}
                              size="small"
                              sx={{
                                borderRadius: '10px',
                                bgcolor: expense.payment_method === 'cash' ? 'rgba(16,185,129,0.15)' : expense.payment_method === 'cheque' ? 'rgba(59,130,246,0.15)' : 'rgba(236,72,153,0.15)',
                                color: expense.payment_method === 'cash' ? '#34d399' : expense.payment_method === 'cheque' ? '#60a5fa' : '#f472b6',
                                fontWeight: 600,
                                border: expense.payment_method === 'cash' ? '1px solid rgba(16,185,129,0.3)' : expense.payment_method === 'cheque' ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(236,72,153,0.3)'
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => handleEdit(expense)}
                              sx={{ color: '#818cf8', mr: 1, '&:hover': { bgcolor: 'rgba(129,140,248,0.1)' } }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => handleDelete(expense.id)}
                              sx={{ color: '#f87171', '&:hover': { bgcolor: 'rgba(248,113,113,0.1)' } }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {totalPages > 1 && (
                <Box display="flex" justifyContent="center" py={3} borderTop="1px solid rgba(255,255,255,0.05)">
                  <Pagination
                    count={totalPages}
                    page={page}
                    onChange={(e, v) => setPage(v)}
                    sx={{
                      '& .MuiPaginationItem-root': {
                        borderRadius: '12px',
                        color: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        '&.Mui-selected': {
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: 'white'
                        }
                      }
                    }}
                  />
                </Box>
              )}
            </Paper>

            {/* Add/Edit Dialog */}
            <Dialog
              open={openDialog}
              onClose={() => setOpenDialog(false)}
              maxWidth="md"
              fullWidth
              PaperProps={{
                sx: {
                  borderRadius: '28px',
                  overflow: 'hidden',
                  background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }
              }}
            >
              <Box sx={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', p: 2 }}>
                <DialogTitle sx={{ color: 'white', p: 2 }}>
                  {editExpense ? 'Edit Expense' : 'Add New Expense'}
                </DialogTitle>
              </Box>
              <form onSubmit={handleSubmit}>
                <DialogContent sx={{ p: 3 }}>
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                      <FormControl fullWidth required>
                        <InputLabel sx={{ color: '#94a3b8' }}>Expense Type</InputLabel>
                        <Select
                          name="expense_type_id"
                          value={formData.expense_type_id}
                          onChange={handleInputChange}
                          label="Expense Type"
                          sx={{
                            borderRadius: '14px',
                            color: '#e2e8f0',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                            '&.Mui-focused': {
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            },
                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                              borderColor: '#818cf8',
                            },
                            '& .MuiSvgIcon-root': { color: '#94a3b8' }
                          }}
                        >
                          {expenseTypes.map((type) => (
                            <MenuItem key={type.id} value={type.id}>{type.name}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <DatePicker
                        label="Expense Date"
                        value={formData.date}
                        onChange={(value) => handleDateChange('date', value)}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            required: true,
                            sx: {
                              '& .MuiOutlinedInput-root': {
                                borderRadius: '14px',
                                color: '#e2e8f0',
                                backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                '& fieldset': {
                                  borderColor: 'rgba(255, 255, 255, 0.2)',
                                },
                                '&:hover fieldset': {
                                  borderColor: 'rgba(129, 140, 248, 0.5)',
                                },
                                '&.Mui-focused': {
                                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                                },
                                '&.Mui-focused fieldset': {
                                  borderColor: '#818cf8',
                                },
                              },
                              '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': {
                                  color: '#818cf8',
                                },
                              },
                            }
                          }
                        }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Expense Name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '14px',
                            color: '#e2e8f0',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            '& fieldset': {
                              borderColor: 'rgba(255, 255, 255, 0.2)',
                            },
                            '&:hover fieldset': {
                              borderColor: 'rgba(129, 140, 248, 0.5)',
                            },
                            '&.Mui-focused': {
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#818cf8',
                            },
                          },
                          '& .MuiInputLabel-root': {
                            color: '#94a3b8',
                            '&.Mui-focused': {
                              color: '#818cf8',
                            },
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="Amount (LKR)"
                        name="amount"
                        type="number"
                        value={formData.amount}
                        onChange={handleInputChange}
                        required
                        inputProps={{ step: "0.01" }}
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            borderRadius: '14px',
                            color: '#e2e8f0',
                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                            '& fieldset': {
                              borderColor: 'rgba(255, 255, 255, 0.2)',
                            },
                            '&:hover fieldset': {
                              borderColor: 'rgba(129, 140, 248, 0.5)',
                            },
                            '&.Mui-focused': {
                              backgroundColor: 'rgba(15, 23, 42, 0.8)',
                            },
                            '&.Mui-focused fieldset': {
                              borderColor: '#818cf8',
                            },
                          },
                          '& .MuiInputLabel-root': {
                            color: '#94a3b8',
                            '&.Mui-focused': {
                              color: '#818cf8',
                            },
                          },
                        }}
                      />
                    </Grid>

                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom fontWeight={600} sx={{ color: '#cbd5e1' }}>
                        Payment Method
                      </Typography>
                      <RadioGroup row name="payment_method" value={formData.payment_method} onChange={handlePaymentMethodChange}>
                        <FormControlLabel value="cash" control={<Radio sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#10b981' } }} />} label={<span style={{ color: '#e2e8f0' }}>Cash</span>} />
                        <FormControlLabel value="cheque" control={<Radio sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#3b82f6' } }} />} label={<span style={{ color: '#e2e8f0' }}>Cheque</span>} />
                        <FormControlLabel value="bank_transfer" control={<Radio sx={{ color: '#94a3b8', '&.Mui-checked': { color: '#ec4899' } }} />} label={<span style={{ color: '#e2e8f0' }}>Bank Transfer</span>} />
                      </RadioGroup>
                    </Grid>

                    {renderConditionalFields()}
                  </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <Button
                    onClick={() => setOpenDialog(false)}
                    sx={{ borderRadius: '12px', textTransform: 'none', px: 3, color: '#94a3b8' }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={loading}
                    sx={{
                      borderRadius: '12px',
                      textTransform: 'none',
                      px: 4,
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      '&:hover': { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }
                    }}
                  >
                    {loading ? <CircularProgress size={24} /> : (editExpense ? 'Update' : 'Save')}
                  </Button>
                </DialogActions>
              </form>
            </Dialog>
          </Box>
        </Box>
      </LocalizationProvider>
    </ThemeProvider>
  );
};

export default ExpenseDashboard;