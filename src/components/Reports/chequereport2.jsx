import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  TextField,
  Button,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Fade,
  Snackbar,
  Divider,
  Stack,
  useTheme,
  alpha,
  Checkbox,
  Badge,
  Avatar,
  LinearProgress,
  Tab,
  Tabs,
  Menu,
  ListItemIcon,
  ListItemText,
  Popover,
  Switch,
  FormControlLabel,
  Collapse,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  useMediaQuery,
  Popover as MuiPopover,
} from '@mui/material';
import { styled } from '@mui/material/styles';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker as MuiDatePicker } from '@mui/x-date-pickers/DatePicker';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  Receipt as ReceiptIcon,
  Print as PrintIcon,
  DateRange as DateRangeIcon,
  AccountBalance as AccountBalanceIcon,
  CreditCard as CreditCardIcon,
  People as PeopleIcon,
  AttachMoney as MoneyIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  DoneAll as DoneAllIcon,
  Undo as UndoIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  MoreVert as MoreVertIcon,
  PictureAsPdf as PictureAsPdfIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  CalendarToday as CalendarTodayIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  Info as InfoIcon,
  History as HistoryIcon,
} from '@mui/icons-material';
import { format, parseISO, isValid, startOfDay, endOfDay, subDays, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import api from '../../api';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion } from 'framer-motion';
import { useReactToPrint } from 'react-to-print';

// Styled components for cheque
const ChequeContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  maxWidth: 750,
  margin: '0 auto',
  background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
  borderRadius: 12,
  position: 'relative',
  border: '3px solid #1a237e',
  boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    bottom: 10,
    border: '1px solid rgba(26, 35, 126, 0.15)',
    borderRadius: 8,
    pointerEvents: 'none',
  },
  '@media print': {
    boxShadow: 'none',
    border: '2px solid #000',
    background: 'white',
  }
}));

const SecurityPattern = styled(Box)({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: `repeating-linear-gradient(
    45deg,
    transparent,
    transparent 20px,
    rgba(26, 35, 126, 0.02) 20px,
    rgba(26, 35, 126, 0.02) 21px
  )`,
  pointerEvents: 'none',
  borderRadius: 12,
});

const ChequeNumber = styled(Typography)(({ theme }) => ({
  fontFamily: '"Courier New", monospace',
  fontWeight: 'bold',
  color: '#1a237e',
  letterSpacing: 2,
  background: 'linear-gradient(135deg, #e3f2fd, #bbdefb)',
  padding: theme.spacing(0.5, 2),
  borderRadius: 4,
  border: '1px solid #1a237e',
  fontSize: '1.1rem',
}));

const AmountInWords = styled(Typography)({
  fontFamily: '"Times New Roman", serif',
  fontSize: '1rem',
  color: '#1a237e',
  borderTop: '1px dashed #1a237e',
  borderBottom: '1px dashed #1a237e',
  padding: '8px 0',
  marginTop: 8,
  minHeight: 40,
});

// Card view component for Sales Cheques
const ChequeCard = ({ transaction, index, isSelected, onSelect, onViewDetails, onToggleExpand, isExpanded, isFavorite, onToggleFavorite, onRealize, onUnrealize }) => {
  // Use bank_realized for status
  const isRealized = transaction.bank_realized === 'Y';
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card
        sx={{
          mb: 2,
          bgcolor: isSelected ? alpha('#1976d2', 0.05) : 'white',
          borderLeft: `4px solid ${isRealized ? '#4caf50' : transaction.source === 'sales' ? '#2196f3' : '#0288d1'}`,
          '&:hover': {
            boxShadow: 6,
            transform: 'translateY(-2px)',
            transition: 'all 0.3s ease',
          },
        }}
      >
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="flex-start">
            <Checkbox
              checked={isSelected}
              onChange={() => onSelect(transaction)}
              color="primary"
            />
            <Box flex={1}>
              <Grid container spacing={1}>
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">Cheque No</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    {transaction.cheque_no || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">Amount</Typography>
                  <Typography variant="h6" color="#2e7d32" sx={{ fontWeight: 'bold' }}>
                    LKR {transaction.amount?.toFixed(2) || '0.00'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">Date</Typography>
                  <Typography variant="body1">
                    {transaction.cheque_date ? format(parseISO(transaction.cheque_date), 'dd/MM/yyyy') : 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Typography variant="subtitle2" color="textSecondary">Status</Typography>
                  <Chip
                    label={isRealized ? 'Bank Realized' : 'Unrealized'}
                    size="small"
                    color={isRealized ? 'success' : 'warning'}
                    icon={isRealized ? <CheckCircleIcon /> : <CancelIcon />}
                  />
                </Grid>
              </Grid>

              <Collapse in={isExpanded}>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Source</Typography>
                    <Typography variant="body2">
                      {transaction.source === 'sales' ? 'Sales' : 'Sales History'}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Reference</Typography>
                    <Typography variant="body2">{transaction.reference || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Bill No</Typography>
                    <Typography variant="body2">{transaction.bill_no || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Bank</Typography>
                    <Typography variant="body2">{transaction.bank_name || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Customer Name</Typography>
                    <Typography variant="body2">{transaction.customer_name || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Customer Code</Typography>
                    <Typography variant="body2">{transaction.customer_code || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Debtor No</Typography>
                    <Typography variant="body2">{transaction.debtor_no || transaction.debtor_no_record || 'N/A'}</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <Typography variant="caption" color="textSecondary">Is Fully Paid</Typography>
                    <Chip
                      label={transaction.is_fully_paid ? 'Yes' : 'No'}
                      size="small"
                      color={transaction.is_fully_paid ? 'success' : 'warning'}
                    />
                  </Grid>
                  {isRealized && (
                    <Grid item xs={12}>
                      <Typography variant="caption" color="textSecondary">Bank Realized Date</Typography>
                      <Typography variant="body2">
                        {transaction.realized_date ? format(parseISO(transaction.realized_date), 'dd/MM/yyyy') : 'N/A'}
                      </Typography>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <Typography variant="caption" color="textSecondary">Created At</Typography>
                    <Typography variant="body2">
                      {transaction.created_at ? format(parseISO(transaction.created_at), 'dd/MM/yyyy HH:mm') : 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Collapse>
            </Box>
            <Stack direction="row" spacing={0.5}>
              <Tooltip title="Toggle Details">
                <IconButton
                  size="small"
                  onClick={() => onToggleExpand(index)}
                >
                  {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                </IconButton>
              </Tooltip>
              <Tooltip title="View Cheque">
                <IconButton size="small" color="primary" onClick={() => onViewDetails(transaction)}>
                  <ViewIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                <IconButton
                  size="small"
                  color="warning"
                  onClick={() => onToggleFavorite(transaction)}
                >
                  {isFavorite ? <StarIcon /> : <StarBorderIcon />}
                </IconButton>
              </Tooltip>
              {!isRealized && (
                <Tooltip title="Realize">
                  <IconButton
                    size="small"
                    color="success"
                    onClick={() => onRealize(transaction)}
                  >
                    <CheckIcon />
                  </IconButton>
                </Tooltip>
              )}
              {isRealized && (
                <Tooltip title="Unrealize">
                  <IconButton
                    size="small"
                    color="warning"
                    onClick={() => onUnrealize(transaction)}
                  >
                    <UndoIcon />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const ChequeReport2 = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isTablet = useMediaQuery(theme.breakpoints.down('md'));
  const printRef = useRef();

  // State for data and loading
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  
  // State for pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(isMobile ? 5 : 10);
  
  // State for selection
  const [selectedCheques, setSelectedCheques] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  
  // State for date range
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [tempStartDate, setTempStartDate] = useState(null);
  const [tempEndDate, setTempEndDate] = useState(null);
  
  // State for filters
  const [filters, setFilters] = useState({
    search: '',
    source: 'all',
    bankAccountId: '',
    minAmount: '',
    maxAmount: '',
    realizedStatus: 'all',
    sortBy: 'date_desc',
  });
  
  // State for dialogs
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [realizeDialogOpen, setRealizeDialogOpen] = useState(false);
  const [selectedForRealization, setSelectedForRealization] = useState([]);
  const [realizeAction, setRealizeAction] = useState('realize');
  
  // State for UI
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [showFilters, setShowFilters] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [viewMode, setViewMode] = useState('table');
  const [showRealizedOnly, setShowRealizedOnly] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [favoriteCheques, setFavoriteCheques] = useState([]);
  const [activeDateRange, setActiveDateRange] = useState('all');

  // Theme colors
  const colors = {
    primary: '#1976d2',
    secondary: '#dc004e',
    success: '#2e7d32',
    warning: '#ed6c02',
    info: '#0288d1',
    background: '#f5f7fa',
    card: '#ffffff',
    realized: '#4caf50',
    unrealized: '#ff9800',
    customer: '#2196f3',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  };

  // Quick date range options
  const quickDateRanges = [
    { label: 'All', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'Yesterday', value: 'yesterday' },
    { label: 'Last 7 Days', value: 'last7' },
    { label: 'Last 14 Days', value: 'last14' },
    { label: 'Last 30 Days', value: 'last30' },
    { label: 'This Month', value: 'thisMonth' },
    { label: 'Last Month', value: 'lastMonth' },
    { label: 'Custom', value: 'custom' },
  ];

  // Fetch cheque transactions from Sales and SalesHistory
  const fetchChequeTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/cheque-report/sales');
      
      if (response.data.success) {
        const data = response.data.data || [];
        setTransactions(data);
        // Apply initial date filter
        applyDateFilter(data);
        setSelectedCheques([]);
        setSelectAll(false);
        setSnackbar({
          open: true,
          message: `Successfully loaded ${data.length} cheque transactions from Sales`,
          severity: 'success'
        });
        fetchSummary();
      } else {
        throw new Error(response.data.message || 'Failed to fetch cheque transactions');
      }
    } catch (err) {
      console.error('Error fetching cheque transactions:', err);
      setError(err.message || 'Failed to fetch cheque transactions. Please try again.');
      setSnackbar({
        open: true,
        message: err.message || 'Failed to fetch cheque transactions',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Apply date filter
  const applyDateFilter = useCallback((data = transactions) => {
    let filtered = [...data];
    
    if (startDate) {
      const start = startOfDay(startDate);
      filtered = filtered.filter(t => {
        const chequeDate = t.cheque_date ? parseISO(t.cheque_date) : null;
        if (!chequeDate || !isValid(chequeDate)) return false;
        return chequeDate >= start;
      });
    }
    
    if (endDate) {
      const end = endOfDay(endDate);
      filtered = filtered.filter(t => {
        const chequeDate = t.cheque_date ? parseISO(t.cheque_date) : null;
        if (!chequeDate || !isValid(chequeDate)) return false;
        return chequeDate <= end;
      });
    }
    
    setFilteredTransactions(filtered);
    setPage(0);
  }, [startDate, endDate, transactions]);

  // Apply all filters
  const applyAllFilters = useCallback(() => {
    let filtered = [...transactions];
    
    // Date range filter
    if (startDate) {
      const start = startOfDay(startDate);
      filtered = filtered.filter(t => {
        const chequeDate = t.cheque_date ? parseISO(t.cheque_date) : null;
        if (!chequeDate || !isValid(chequeDate)) return false;
        return chequeDate >= start;
      });
    }
    
    if (endDate) {
      const end = endOfDay(endDate);
      filtered = filtered.filter(t => {
        const chequeDate = t.cheque_date ? parseISO(t.cheque_date) : null;
        if (!chequeDate || !isValid(chequeDate)) return false;
        return chequeDate <= end;
      });
    }
    
    // Search filter
    if (filters.search.trim()) {
      const searchTerm = filters.search.toLowerCase().trim();
      filtered = filtered.filter(t => 
        (t.cheque_no && t.cheque_no.toLowerCase().includes(searchTerm)) ||
        (t.bill_no && t.bill_no.toLowerCase().includes(searchTerm)) ||
        (t.reference && t.reference.toLowerCase().includes(searchTerm)) ||
        (t.bank_name && t.bank_name.toLowerCase().includes(searchTerm)) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(searchTerm)) ||
        (t.customer_code && t.customer_code.toLowerCase().includes(searchTerm)) ||
        (t.creditor_no && t.creditor_no.toLowerCase().includes(searchTerm))
      );
    }
    
    // Source filter
    if (filters.source !== 'all') {
      filtered = filtered.filter(t => t.source === filters.source);
    }
    
    // Bank account filter
    if (filters.bankAccountId) {
      filtered = filtered.filter(t => 
        t.bank_account_id && t.bank_account_id.toString() === filters.bankAccountId
      );
    }
    
    // Amount range filter
    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount);
      filtered = filtered.filter(t => t.amount >= min);
    }
    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount);
      filtered = filtered.filter(t => t.amount <= max);
    }
    
    // Realized status filter - using bank_realized
    if (filters.realizedStatus !== 'all') {
      if (filters.realizedStatus === 'realized') {
        filtered = filtered.filter(t => t.bank_realized === 'Y');
      } else if (filters.realizedStatus === 'unrealized') {
        filtered = filtered.filter(t => !t.bank_realized || t.bank_realized !== 'Y');
      }
    }
    
    // Sorting
    switch (filters.sortBy) {
      case 'date_desc':
        filtered.sort((a, b) => new Date(b.cheque_date) - new Date(a.cheque_date));
        break;
      case 'date_asc':
        filtered.sort((a, b) => new Date(a.cheque_date) - new Date(b.cheque_date));
        break;
      case 'amount_desc':
        filtered.sort((a, b) => b.amount - a.amount);
        break;
      case 'amount_asc':
        filtered.sort((a, b) => a.amount - b.amount);
        break;
      case 'cheque_no':
        filtered.sort((a, b) => (a.cheque_no || '').localeCompare(b.cheque_no || ''));
        break;
      default:
        break;
    }
    
    setFilteredTransactions(filtered);
    setPage(0);
    setSelectedCheques([]);
    setSelectAll(false);
  }, [transactions, startDate, endDate, filters]);

  // Handle quick date range selection
  const handleQuickDateRange = (range) => {
    const now = new Date();
    let start = null;
    let end = null;
    
    switch (range) {
      case 'all':
        start = null;
        end = null;
        break;
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'yesterday':
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
        break;
      case 'last7':
        start = startOfDay(subDays(now, 7));
        end = endOfDay(now);
        break;
      case 'last14':
        start = startOfDay(subDays(now, 14));
        end = endOfDay(now);
        break;
      case 'last30':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfDay(now);
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        start = startOfMonth(lastMonth);
        end = endOfMonth(lastMonth);
        break;
      case 'custom':
        setActiveDateRange('custom');
        setTempStartDate(null);
        setTempEndDate(null);
        return;
      default:
        break;
    }
    
    setStartDate(start);
    setEndDate(end);
    setTempStartDate(start);
    setTempEndDate(end);
    setActiveDateRange(range);
  };

  // Handle date picker changes
  const handleStartDateChange = (value) => {
    setTempStartDate(value);
  };

  const handleEndDateChange = (value) => {
    setTempEndDate(value);
  };

  // Apply custom date range
  const applyCustomDateRange = () => {
    if (tempStartDate || tempEndDate) {
      setStartDate(tempStartDate);
      setEndDate(tempEndDate);
      setActiveDateRange('custom');
    }
  };

  // Clear date range
  const clearDateRange = () => {
    setStartDate(null);
    setEndDate(null);
    setTempStartDate(null);
    setTempEndDate(null);
    setActiveDateRange('all');
  };

  // Cancel custom date range
  const cancelCustomDateRange = () => {
    setTempStartDate(null);
    setTempEndDate(null);
    setActiveDateRange('all');
  };

  // Format date for display
  const formatDateDisplay = (date) => {
    if (!date) return 'Any Date';
    return format(date, 'dd/MM/yyyy');
  };

  // Get date range display text
  const getDateRangeDisplay = () => {
    if (!startDate && !endDate) return 'All Dates';
    if (startDate && endDate) {
      return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
    }
    if (startDate) return `From ${formatDateDisplay(startDate)}`;
    return `Until ${formatDateDisplay(endDate)}`;
  };

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const response = await api.get('/cheque-report/sales-summary');
      if (response.data.success) {
        setSummary(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    const currentPageData = filteredTransactions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
    if (selectAll) {
      setSelectedCheques([]);
    } else {
      const allIds = currentPageData.map(t => ({
        record_id: t.record_id,
        record_type: t.record_type,
        source: t.source
      }));
      setSelectedCheques(allIds);
    }
    setSelectAll(!selectAll);
  }, [selectAll, filteredTransactions, page, rowsPerPage]);

  // Handle select individual cheque
  const handleSelectCheque = useCallback((transaction) => {
    const isSelected = selectedCheques.some(
      s => s.record_id === transaction.record_id && s.record_type === transaction.record_type
    );
    
    if (isSelected) {
      setSelectedCheques(selectedCheques.filter(
        s => !(s.record_id === transaction.record_id && s.record_type === transaction.record_type)
      ));
    } else {
      setSelectedCheques([...selectedCheques, {
        record_id: transaction.record_id,
        record_type: transaction.record_type,
        source: transaction.source
      }]);
    }
  }, [selectedCheques]);

  // Check if a cheque is selected
  const isChequeSelected = useCallback((transaction) => {
    return selectedCheques.some(
      s => s.record_id === transaction.record_id && s.record_type === transaction.record_type
    );
  }, [selectedCheques]);

  // Handle realize cheques
  const handleRealizeCheques = useCallback(async () => {
    if (selectedCheques.length === 0) {
      setSnackbar({ open: true, message: 'Please select at least one cheque to realize', severity: 'warning' });
      return;
    }
    setRealizeAction('realize');
    setSelectedForRealization([...selectedCheques]);
    setRealizeDialogOpen(true);
  }, [selectedCheques]);

  // Handle unrealize cheques
  const handleUnrealizeCheques = useCallback(async () => {
    if (selectedCheques.length === 0) {
      setSnackbar({ open: true, message: 'Please select at least one cheque to unrealize', severity: 'warning' });
      return;
    }
    setRealizeAction('unrealize');
    setSelectedForRealization([...selectedCheques]);
    setRealizeDialogOpen(true);
  }, [selectedCheques]);

  // Confirm realize/unrealize - UPDATED to use new bank realize endpoints
  const confirmRealize = useCallback(async () => {
    setRealizeDialogOpen(false);
    setLoading(true);
    
    try {
      // NEW: Use bank realize endpoints
      const endpoint = realizeAction === 'realize' 
        ? '/cheque-report/sales-bank-realize' 
        : '/cheque-report/sales-bank-unrealize';
      
      const payload = {
        cheques: selectedForRealization,
      };
      
      const response = await api.post(endpoint, payload);
      
      if (response.data.success) {
        setSnackbar({ 
          open: true, 
          message: response.data.message, 
          severity: 'success' 
        });
        
        // Show errors if any
        if (response.data.errors && response.data.errors.length > 0) {
          console.warn('Errors:', response.data.errors);
          setSnackbar({ 
            open: true, 
            message: `Success with warnings: ${response.data.errors.join(', ')}`, 
            severity: 'warning' 
          });
        }
        
        fetchChequeTransactions();
      } else {
        throw new Error(response.data.message || 'Operation failed');
      }
    } catch (err) {
      console.error('Error:', err);
      setSnackbar({ 
        open: true, 
        message: err.message || 'Operation failed. Please try again.', 
        severity: 'error' 
      });
    } finally {
      setLoading(false);
      setSelectedCheques([]);
      setSelectAll(false);
    }
  }, [realizeAction, selectedForRealization, fetchChequeTransactions]);

  // Single cheque realize
  const handleSingleRealize = useCallback((transaction) => {
    setRealizeAction('realize');
    setSelectedForRealization([{
      record_id: transaction.record_id,
      record_type: transaction.record_type,
      source: transaction.source
    }]);
    setRealizeDialogOpen(true);
  }, []);

  // Single cheque unrealize
  const handleSingleUnrealize = useCallback((transaction) => {
    setRealizeAction('unrealize');
    setSelectedForRealization([{
      record_id: transaction.record_id,
      record_type: transaction.record_type,
      source: transaction.source
    }]);
    setRealizeDialogOpen(true);
  }, []);

  // Export to Excel
  const exportToExcel = useCallback(() => {
    try {
      const exportData = filteredTransactions.map(t => ({
        'Cheque No': t.cheque_no || 'N/A',
        'Amount': t.amount || 0,
        'Cheque Date': t.cheque_date ? format(parseISO(t.cheque_date), 'yyyy-MM-dd') : 'N/A',
        'Reference': t.reference || 'N/A',
        'Bill No': t.bill_no || 'N/A',
        'Customer Name': t.customer_name || 'N/A',
        'Customer Code': t.customer_code || 'N/A',
        'Source': t.source || 'N/A',
        'Bank': t.bank_name || 'N/A',
        'Is Fully Paid': t.is_fully_paid ? 'Yes' : 'No',
        'Bank Realized': t.bank_realized === 'Y' ? 'Yes' : 'No',
        'Created At': t.created_at ? format(parseISO(t.created_at), 'yyyy-MM-dd HH:mm') : 'N/A',
      }));
      
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      
      const colWidths = Object.keys(exportData[0] || {}).map((key) => ({
        wch: Math.max(key.length, 15)
      }));
      ws['!cols'] = colWidths;
      
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Cheque Transactions');
      
      const filename = `sales_cheque_transactions_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      setSnackbar({ open: true, message: 'Excel file downloaded successfully!', severity: 'success' });
    } catch (err) {
      console.error('Export error:', err);
      setSnackbar({ open: true, message: 'Failed to export Excel file', severity: 'error' });
    }
  }, [filteredTransactions]);

  // Export to PDF
  const exportToPDF = useCallback(() => {
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      doc.setFillColor(26, 35, 126);
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.text('Sales Cheque Transactions Report', pageWidth / 2, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(200, 200, 200);
      doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, pageWidth / 2, 32, { align: 'center' });
      
      let yPos = 55;
      if (summary) {
        doc.setFillColor(245, 245, 245);
        doc.rect(14, yPos, pageWidth - 28, 25, 'F');
        doc.setFontSize(10);
        doc.setTextColor(33, 33, 33);
        const summaryText = [
          `Total: ${summary.total_cheques}`,
          `Amount: LKR ${summary.total_amount.toFixed(2)}`,
          `Average: LKR ${summary.average_amount?.toFixed(2) || '0.00'}`,
          `Realized: ${summary.realized_cheques || 0}`,
          `Unrealized: ${summary.unrealized_cheques || 0}`
        ];
        const spacing = (pageWidth - 28) / summaryText.length;
        summaryText.forEach((text, i) => {
          doc.text(text, 14 + (i * spacing) + 5, yPos + 15);
        });
        yPos += 35;
      }
      
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`Date Range: ${getDateRangeDisplay()}`, 14, yPos);
      yPos += 10;
      
      const tableData = filteredTransactions.slice(0, 50).map(t => [
        t.cheque_no || 'N/A',
        `LKR ${(t.amount || 0).toFixed(2)}`,
        t.cheque_date ? format(parseISO(t.cheque_date), 'yyyy-MM-dd') : 'N/A',
        t.reference || 'N/A',
        t.bill_no || 'N/A',
        t.customer_name || 'N/A',
        t.source || 'N/A',
        t.bank_realized === 'Y' ? '✓' : '✗',
      ]);
      
      autoTable(doc, {
        head: [['Cheque No', 'Amount', 'Date', 'Reference', 'Bill No', 'Customer', 'Source', 'Bank Realized']],
        body: tableData,
        startY: yPos,
        styles: {
          fontSize: 8,
          cellPadding: 2,
          lineColor: [200, 200, 200],
          lineWidth: 0.1,
        },
        headStyles: {
          fillColor: [26, 35, 126],
          textColor: [255, 255, 255],
          fontSize: 9,
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [248, 249, 250],
        },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `Page ${data.pageNumber} of ${doc.internal.getNumberOfPages()} | ${filteredTransactions.length} transactions`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
          );
        },
      });
      
      const filename = `sales_cheque_transactions_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`;
      doc.save(filename);
      
      setSnackbar({ open: true, message: 'PDF file downloaded successfully!', severity: 'success' });
    } catch (err) {
      console.error('PDF export error:', err);
      setSnackbar({ open: true, message: 'Failed to export PDF file', severity: 'error' });
    }
  }, [filteredTransactions, summary]);

  // View transaction details
  const viewTransactionDetails = (transaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  // Handle filter reset
  const resetFilters = () => {
    setFilters({
      search: '',
      source: 'all',
      bankAccountId: '',
      minAmount: '',
      maxAmount: '',
      realizedStatus: 'all',
      sortBy: 'date_desc',
    });
    clearDateRange();
    setFilteredTransactions(transactions);
    setPage(0);
    setSelectedCheques([]);
    setSelectAll(false);
    setTabValue(0);
  };

  // Get unique values for filters
  const bankAccounts = useMemo(() => {
    const accounts = new Set();
    transactions.forEach(t => {
      if (t.bank_account_id) accounts.add(t.bank_account_id.toString());
    });
    return Array.from(accounts);
  }, [transactions]);

  const sources = useMemo(() => {
    const sourceSet = new Set();
    transactions.forEach(t => {
      if (t.source) sourceSet.add(t.source);
    });
    return Array.from(sourceSet);
  }, [transactions]);

  // Load data on mount
  useEffect(() => {
    fetchChequeTransactions();
  }, [fetchChequeTransactions]);

  // Apply all filters when dependencies change
  useEffect(() => {
    applyAllFilters();
  }, [applyAllFilters]);

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    const sourceMap = ['all', 'sales', 'sales_history'];
    setFilters({ ...filters, source: sourceMap[newValue] });
  };

  // Handle pagination
  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Handle menu
  const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
  const handleMenuClose = () => setAnchorEl(null);

  // Print handler
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  });

  // Sri Lankan Cheque View
  const SriLankanChequeView = ({ transaction }) => {
    if (!transaction) return null;
    
    const amountInWords = (amount) => {
      if (!amount) return 'Zero';
      const num = Math.round(amount);
      const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
      return `${words[num % 10] || 'Invalid'}`;
    };

    return (
      <ChequeContainer ref={printRef} id="cheque-print">
        <SecurityPattern />
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
              {transaction.bank_name || 'BANK OF CEYLON'}
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              {transaction.bank_account_id ? `Account #: ${transaction.bank_account_id}` : 'Current Account'}
            </Typography>
          </Box>
          <Box sx={{ 
            width: 60, 
            height: 60, 
            bgcolor: '#1a237e', 
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: 12,
          }}>
            LOGO
          </Box>
        </Box>

        <Divider sx={{ mb: 3, borderColor: '#1a237e' }} />

        <Grid container spacing={2}>
          <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ChequeNumber variant="body2">
              No: {transaction.cheque_no || 'N/A'}
            </ChequeNumber>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle2" color="textSecondary" sx={{ minWidth: 60 }}>
                Date:
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                {transaction.cheque_date ? format(parseISO(transaction.cheque_date), 'dd/MM/yyyy') : '____/____/____'}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ 
              border: '1px solid #1a237e', 
              p: 2, 
              borderRadius: 1, 
              bgcolor: 'rgba(255,255,255,0.8)',
              minHeight: 60,
            }}>
              <Typography variant="subtitle2" color="textSecondary">Pay:</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {transaction.customer_name || transaction.creditor_no || '________________________'}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ 
              border: '1px solid #1a237e', 
              p: 2, 
              borderRadius: 1, 
              bgcolor: 'rgba(255,255,255,0.8)',
              minHeight: 80,
            }}>
              <Typography variant="subtitle2" color="textSecondary">Amount:</Typography>
              <Typography variant="h5" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
                LKR {transaction.amount?.toFixed(2) || '0.00'}
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} md={6}>
            <Box sx={{ 
              border: '1px solid #1a237e', 
              p: 2, 
              borderRadius: 1, 
              bgcolor: 'rgba(255,255,255,0.8)',
              minHeight: 80,
            }}>
              <Typography variant="subtitle2" color="textSecondary">Amount in Words:</Typography>
              <AmountInWords variant="body1">
                {amountInWords(transaction.amount)} rupees only
              </AmountInWords>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ 
              border: '1px solid #1a237e', 
              p: 2, 
              borderRadius: 1, 
              bgcolor: 'rgba(255,255,255,0.8)',
            }}>
              <Typography variant="subtitle2" color="textSecondary">Reference:</Typography>
              <Typography variant="body2">{transaction.reference || 'N/A'}</Typography>
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
            }}>
              <Chip
                label={`Source: ${transaction.source || 'N/A'}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Bill: ${transaction.bill_no || 'N/A'}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={transaction.bank_realized === 'Y' ? 'Bank Realized ✅' : 'Pending ⏳'}
                color={transaction.bank_realized === 'Y' ? 'success' : 'warning'}
                size="small"
              />
            </Box>
          </Grid>

          <Grid item xs={12}>
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              mt: 2, 
              pt: 2, 
              borderTop: '1px solid #1a237e',
              flexWrap: 'wrap',
              gap: 2,
            }}>
              <Box sx={{ minWidth: 120 }}>
                <Typography variant="caption" color="textSecondary">Authorized Signature</Typography>
                <Box sx={{ height: 40, borderBottom: '1px solid #1a237e', mt: 1 }} />
              </Box>
              <Box sx={{ minWidth: 120 }}>
                <Typography variant="caption" color="textSecondary">Customer</Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {transaction.customer_name || '_______________'}
                </Typography>
              </Box>
              <Box sx={{ minWidth: 120 }}>
                <Typography variant="caption" color="textSecondary">Date</Typography>
                <Box sx={{ height: 40, borderBottom: '1px solid #1a237e', mt: 1 }} />
              </Box>
            </Box>
          </Grid>
        </Grid>

        <Box sx={{ 
          textAlign: 'center', 
          mt: 3, 
          pt: 2, 
          borderTop: '1px solid #1a237e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Typography variant="caption" color="textSecondary">
            This cheque is subject to terms and conditions
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {format(new Date(), 'dd/MM/yyyy HH:mm')}
          </Typography>
        </Box>
      </ChequeContainer>
    );
  };

  // Render loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>Loading cheque transactions from Sales...</Typography>
        <LinearProgress sx={{ width: 300, mt: 2 }} />
      </Box>
    );
  }

  // Render error state
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
        <Button variant="contained" startIcon={<RefreshIcon />} onClick={fetchChequeTransactions}>
          Retry
        </Button>
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, bgcolor: colors.background, minHeight: '100vh' }}>
        {/* Header with gradient */}
        <Paper
          sx={{
            p: { xs: 2, md: 4 },
            mb: 4,
            background: colors.gradient,
            borderRadius: 3,
            color: 'white',
          }}
        >
          <Grid container alignItems="center" spacing={2}>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ReceiptIcon sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                    Sales Cheque Transactions Report
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    View and manage cheque payments from Sales and Sales History
                  </Typography>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 1, flexWrap: 'wrap' }}>
                <Chip
                  icon={<PeopleIcon />}
                  label={`${summary?.total_cheques || 0} Total`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
                <Chip
                  icon={<MoneyIcon />}
                  label={`LKR ${summary?.total_amount?.toFixed(2) || '0.00'}`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`${summary?.realized_cheques || 0} Bank Realized`}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Summary Cards */}
        {summary && (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            {[
              { label: 'Total Cheques', value: summary.total_cheques, icon: <ReceiptIcon />, color: colors.primary },
              { label: 'Total Amount', value: `LKR ${summary.total_amount.toFixed(2)}`, icon: <MoneyIcon />, color: colors.success },
              { label: 'Average Amount', value: `LKR ${summary.average_amount?.toFixed(2) || '0.00'}`, icon: <TrendingUpIcon />, color: colors.info },
              { label: 'Bank Realized', value: summary.realized_cheques || 0, icon: <CheckCircleIcon />, color: colors.realized },
              { label: 'Unrealized', value: summary.unrealized_cheques || 0, icon: <CancelIcon />, color: colors.unrealized },
            ].map((item, index) => (
              <Grid item xs={12} sm={6} md={2.4} key={index}>
                <motion.div whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}>
                  <Card sx={{ bgcolor: colors.card, boxShadow: 3, borderTop: `4px solid ${item.color}` }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography color="textSecondary" variant="caption" gutterBottom>
                            {item.label}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                            {item.value}
                          </Typography>
                        </Box>
                        <Avatar sx={{ bgcolor: alpha(item.color, 0.1), color: item.color }}>
                          {item.icon}
                        </Avatar>
                      </Box>
                    </CardContent>
                  </Card>
                </motion.div>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Toolbar */}
        <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by cheque no, bill no, customer name..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                InputProps={{
                  startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
                }}
              />
            </Grid>
            <Grid item xs={12} md={8}>
              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                <Button
                  variant={showFilters ? "contained" : "outlined"}
                  startIcon={<FilterListIcon />}
                  onClick={() => setShowFilters(!showFilters)}
                  size="small"
                >
                  Filters {showFilters && '✓'}
                </Button>
                <Button
                  variant={viewMode === 'cards' ? "contained" : "outlined"}
                  startIcon={viewMode === 'cards' ? <ViewIcon /> : <ReceiptIcon />}
                  onClick={() => setViewMode(viewMode === 'table' ? 'cards' : 'table')}
                  size="small"
                >
                  {viewMode === 'table' ? 'Cards' : 'Table'}
                </Button>
                {selectedCheques.length > 0 && (
                  <>
                    <Badge badgeContent={selectedCheques.length} color="primary">
                      <Button
                        variant="contained"
                        color="success"
                        startIcon={<CheckIcon />}
                        onClick={handleRealizeCheques}
                        size="small"
                      >
                        Realize
                      </Button>
                    </Badge>
                    <Button
                      variant="contained"
                      color="warning"
                      startIcon={<UndoIcon />}
                      onClick={handleUnrealizeCheques}
                      size="small"
                    >
                      Unrealize
                    </Button>
                  </>
                )}
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<RefreshIcon />}
                  onClick={fetchChequeTransactions}
                  size="small"
                >
                  Refresh
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<DownloadIcon />}
                  onClick={exportToExcel}
                  size="small"
                >
                  Excel
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={exportToPDF}
                  size="small"
                >
                  PDF
                </Button>
                <IconButton onClick={handleMenuOpen} size="small">
                  <MoreVertIcon />
                </IconButton>
              </Stack>
            </Grid>
          </Grid>
        </Paper>

        {/* Filters Panel */}
        <Collapse in={showFilters}>
          <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            <Grid container spacing={2}>
              {/* Date Range Section */}
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold', color: '#374151' }}>
                  <CalendarTodayIcon sx={{ fontSize: 18, mr: 1, verticalAlign: 'middle' }} />
                  Date Range
                </Typography>
                
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  {quickDateRanges.map((range) => {
                    const isActive = activeDateRange === range.value;
                    return (
                      <Button
                        key={range.value}
                        variant={isActive ? "contained" : "outlined"}
                        size="small"
                        onClick={() => handleQuickDateRange(range.value)}
                        sx={{
                          borderRadius: 2,
                          textTransform: 'none',
                          ...(isActive && {
                            bgcolor: colors.primary,
                            color: 'white',
                            '&:hover': {
                              bgcolor: colors.primary,
                            }
                          })
                        }}
                      >
                        {range.label}
                      </Button>
                    );
                  })}
                  {(startDate || endDate) && activeDateRange !== 'all' && (
                    <Button
                      variant="outlined"
                      size="small"
                      color="error"
                      onClick={clearDateRange}
                      startIcon={<CloseIcon />}
                    >
                      Clear
                    </Button>
                  )}
                </Stack>
                
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 2, 
                  p: 1.5, 
                  bgcolor: '#f5f5f5', 
                  borderRadius: 1,
                  mb: 2,
                  flexWrap: 'wrap'
                }}>
                  <DateRangeIcon sx={{ color: '#1976d2' }} />
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {getDateRangeDisplay()}
                  </Typography>
                  {(startDate || endDate) && (
                    <Chip 
                      label={`${filteredTransactions.length} transactions`} 
                      size="small" 
                      color="primary" 
                    />
                  )}
                </Box>

                {activeDateRange === 'custom' && (
                  <Box sx={{ 
                    p: 3, 
                    bgcolor: '#f0f4ff', 
                    borderRadius: 2,
                    border: '2px solid #1976d2',
                    mt: 2,
                    boxShadow: '0 2px 8px rgba(25, 118, 210, 0.15)'
                  }}>
                    <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold', color: '#1976d2' }}>
                      📅 Select Custom Date Range
                    </Typography>
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={5}>
                        <MuiDatePicker
                          label="Start Date"
                          value={tempStartDate}
                          onChange={handleStartDateChange}
                          slotProps={{ 
                            textField: { 
                              fullWidth: true, 
                              size: 'medium',
                              placeholder: 'Select start date',
                              variant: 'outlined'
                            } 
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} md={5}>
                        <MuiDatePicker
                          label="End Date"
                          value={tempEndDate}
                          onChange={handleEndDateChange}
                          slotProps={{ 
                            textField: { 
                              fullWidth: true, 
                              size: 'medium',
                              placeholder: 'Select end date',
                              variant: 'outlined'
                            } 
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} md={2}>
                        <Stack direction="row" spacing={1} sx={{ height: '100%', alignItems: 'center' }}>
                          <Button 
                            variant="contained" 
                            color="primary" 
                            onClick={applyCustomDateRange}
                            disabled={!tempStartDate && !tempEndDate}
                            fullWidth
                            sx={{ height: 56 }}
                          >
                            Apply
                          </Button>
                        </Stack>
                      </Grid>
                    </Grid>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="caption" color="textSecondary">
                        <InfoIcon sx={{ fontSize: 14, verticalAlign: 'middle', mr: 0.5 }} />
                        Select start and end date, then click Apply
                      </Typography>
                      <Button 
                        variant="text" 
                        size="small"
                        color="error"
                        onClick={cancelCustomDateRange}
                      >
                        Cancel Custom Range
                      </Button>
                    </Box>
                  </Box>
                )}

                {activeDateRange !== 'custom' && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" color="textSecondary">
                      💡 Click <strong>"Custom"</strong> to select a specific date range
                    </Typography>
                  </Box>
                )}
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Source</InputLabel>
                  <Select
                    value={filters.source}
                    onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                    label="Source"
                  >
                    <MenuItem value="all">All Sources</MenuItem>
                    {sources.map(source => (
                      <MenuItem key={source} value={source}>
                        {source === 'sales' ? 'Sales' : 'Sales History'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
                    label="Sort By"
                  >
                    <MenuItem value="date_desc">Date (Newest)</MenuItem>
                    <MenuItem value="date_asc">Date (Oldest)</MenuItem>
                    <MenuItem value="amount_desc">Amount (High to Low)</MenuItem>
                    <MenuItem value="amount_asc">Amount (Low to High)</MenuItem>
                    <MenuItem value="cheque_no">Cheque No</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Bank Account</InputLabel>
                  <Select
                    value={filters.bankAccountId}
                    onChange={(e) => setFilters({ ...filters, bankAccountId: e.target.value })}
                    label="Bank Account"
                  >
                    <MenuItem value="">All Banks</MenuItem>
                    {bankAccounts.map(account => (
                      <MenuItem key={account} value={account}>Account #{account}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Min Amount"
                  type="number"
                  value={filters.minAmount}
                  onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Max Amount"
                  type="number"
                  value={filters.maxAmount}
                  onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showRealizedOnly}
                      onChange={(e) => {
                        setShowRealizedOnly(e.target.checked);
                        setFilters({ ...filters, realizedStatus: e.target.checked ? 'realized' : 'all' });
                      }}
                    />
                  }
                  label="Show Bank Realized Only"
                />
              </Grid>
              <Grid item xs={12} md={9}>
                <Stack direction="row" spacing={2}>
                  <Button variant="contained" color="primary" startIcon={<SearchIcon />} onClick={applyAllFilters}>
                    Apply Filters
                  </Button>
                  <Button variant="outlined" startIcon={<ClearIcon />} onClick={resetFilters}>
                    Reset All
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Paper>
        </Collapse>

        {/* Tabs */}
        <Paper sx={{ mb: 3, borderRadius: 2 }}>
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            variant="fullWidth"
            sx={{
              '& .MuiTab-root': { py: 2, fontWeight: 'bold' },
            }}
          >
            <Tab icon={<ReceiptIcon />} label={`All (${filteredTransactions.length})`} />
            <Tab icon={<PeopleIcon />} label={`Sales (${filteredTransactions.filter(t => t.source === 'sales').length})`} sx={{ color: colors.customer }} />
            <Tab icon={<HistoryIcon />} label={`Sales History (${filteredTransactions.filter(t => t.source === 'sales_history').length})`} sx={{ color: colors.info }} />
          </Tabs>
        </Paper>

        {/* Transactions */}
        {viewMode === 'table' ? (
          <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <TableContainer>
              <Table stickyHeader>
                <TableHead>
                  <TableRow sx={{ bgcolor: colors.primary }}>
                    <TableCell sx={{ bgcolor: colors.primary, p: 1 }}>
                      <Checkbox
                        checked={selectAll}
                        onChange={handleSelectAll}
                        sx={{ color: 'white', '&.Mui-checked': { color: 'white' } }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Cheque No</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Amount</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Bill No</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Customer</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Source</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', color: 'white', bgcolor: colors.primary }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 5 }}>
                        <Typography variant="body1" color="textSecondary">No cheque transactions found for the selected date range</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTransactions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((transaction, index) => {
                      const isSelected = isChequeSelected(transaction);
                      // Use bank_realized for status
                      const isRealized = transaction.bank_realized === 'Y';
                      return (
                        <TableRow
                          key={transaction.id || index}
                          selected={isSelected}
                          sx={{
                            '&:hover': { bgcolor: alpha(colors.primary, 0.05) },
                            transition: 'background-color 0.2s',
                            bgcolor: isSelected ? alpha(colors.primary, 0.08) : 'inherit',
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox checked={isSelected} onChange={() => handleSelectCheque(transaction)} color="primary" />
                          </TableCell>
                          <TableCell>{page * rowsPerPage + index + 1}</TableCell>
                          <TableCell>
                            <Chip label={transaction.cheque_no || 'N/A'} size="small" color="primary" variant="outlined" />
                          </TableCell>
                          <TableCell>
                            <Typography fontWeight="bold" color={colors.success}>
                              LKR {transaction.amount?.toFixed(2) || '0.00'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {transaction.cheque_date ? (
                              <Typography variant="body2">
                                {format(parseISO(transaction.cheque_date), 'dd/MM/yyyy')}
                              </Typography>
                            ) : 'N/A'}
                          </TableCell>
                          <TableCell>{transaction.bill_no || 'N/A'}</TableCell>
                          <TableCell>
                            {transaction.customer_name || transaction.creditor_no || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={transaction.source === 'sales' ? 'Sales' : 'Sales History'}
                              size="small"
                              color={transaction.source === 'sales' ? 'info' : 'warning'}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={isRealized ? 'Bank Realized' : 'Unrealized'}
                              size="small"
                              color={isRealized ? 'success' : 'warning'}
                              icon={isRealized ? <CheckCircleIcon /> : <CancelIcon />}
                            />
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={0.5}>
                              <Tooltip title="View Cheque">
                                <IconButton size="small" color="primary" onClick={() => viewTransactionDetails(transaction)}>
                                  <ViewIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="View Customer">
                                <IconButton size="small" color="secondary" onClick={() => window.open(`/customer/${transaction.customer_code}`, '_blank')}>
                                  <PeopleIcon />
                                </IconButton>
                              </Tooltip>
                              {!isRealized && (
                                <Tooltip title="Realize">
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => handleSingleRealize(transaction)}
                                  >
                                    <CheckIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {isRealized && (
                                <Tooltip title="Unrealize">
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => handleSingleUnrealize(transaction)}
                                  >
                                    <UndoIcon />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50, 100]}
              component="div"
              count={filteredTransactions.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </Paper>
        ) : (
          <Box>
            {filteredTransactions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((transaction, index) => (
              <ChequeCard
                key={transaction.id || index}
                transaction={transaction}
                index={index}
                isSelected={isChequeSelected(transaction)}
                onSelect={handleSelectCheque}
                onViewDetails={viewTransactionDetails}
                onToggleExpand={(idx) => setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }))}
                isExpanded={expandedRows[index] || false}
                isFavorite={favoriteCheques.includes(transaction.cheque_no)}
                onToggleFavorite={(t) => {
                  if (favoriteCheques.includes(t.cheque_no)) {
                    setFavoriteCheques(favoriteCheques.filter(f => f !== t.cheque_no));
                  } else {
                    setFavoriteCheques([...favoriteCheques, t.cheque_no]);
                  }
                }}
                onRealize={handleSingleRealize}
                onUnrealize={handleSingleUnrealize}
              />
            ))}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50, 100]}
              component="div"
              count={filteredTransactions.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </Box>
        )}

        {/* Cheque Details Dialog */}
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          maxWidth="md"
          fullWidth
          PaperProps={{ sx: { borderRadius: 2, maxWidth: 800 } }}
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6">Sri Lankan Cheque Details</Typography>
              <Box>
                <Chip
                  label={selectedTransaction?.source === 'sales' ? 'Sales' : 'Sales History'}
                  color={selectedTransaction?.source === 'sales' ? 'info' : 'warning'}
                  size="small"
                  sx={{ mr: 1 }}
                />
                <Chip
                  label={selectedTransaction?.bank_realized === 'Y' ? 'Bank Realized ✅' : 'Pending ⏳'}
                  color={selectedTransaction?.bank_realized === 'Y' ? 'success' : 'warning'}
                  size="small"
                />
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent dividers>
            {selectedTransaction && <SriLankanChequeView transaction={selectedTransaction} />}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)} color="primary">Close</Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<PrintIcon />}
              onClick={handlePrint}
            >
              Print Cheque
            </Button>
          </DialogActions>
        </Dialog>

        {/* Realize/Unrealize Dialog */}
        <Dialog
          open={realizeDialogOpen}
          onClose={() => setRealizeDialogOpen(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>{realizeAction === 'realize' ? 'Realize Sales Cheques' : 'Unrealize Sales Cheques'}</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {realizeAction === 'realize'
                ? `You are about to realize ${selectedForRealization.length} sales cheque(s). This will update the bank_realized status to 'Y'.`
                : `You are about to unrealize ${selectedForRealization.length} sales cheque(s). This will update the bank_realized status to 'N'.`
              }
            </DialogContentText>
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="textSecondary">Selected Cheques:</Typography>
              <Typography variant="body2">{selectedForRealization.length} cheque(s) selected</Typography>
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRealizeDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              color={realizeAction === 'realize' ? 'success' : 'warning'}
              onClick={confirmRealize}
            >
              {realizeAction === 'realize' ? 'Confirm Realize' : 'Confirm Unrealize'}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Speed Dial */}
        <SpeedDial
          ariaLabel="Cheque Report Actions"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          icon={<SpeedDialIcon />}
          onClose={() => setSpeedDialOpen(false)}
          onOpen={() => setSpeedDialOpen(true)}
          open={speedDialOpen}
        >
          <SpeedDialAction
            icon={<RefreshIcon />}
            tooltipTitle="Refresh"
            onClick={() => { fetchChequeTransactions(); setSpeedDialOpen(false); }}
          />
          <SpeedDialAction
            icon={<DownloadIcon />}
            tooltipTitle="Export Excel"
            onClick={() => { exportToExcel(); setSpeedDialOpen(false); }}
          />
          <SpeedDialAction
            icon={<PictureAsPdfIcon />}
            tooltipTitle="Export PDF"
            onClick={() => { exportToPDF(); setSpeedDialOpen(false); }}
          />
          <SpeedDialAction
            icon={<PrintIcon />}
            tooltipTitle="Print Report"
            onClick={() => { window.print(); setSpeedDialOpen(false); }}
          />
        </SpeedDial>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%' }}>
            {snackbar.message}
          </Alert>
        </Snackbar>

        {/* Menu Popover */}
        <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
          <MenuItem onClick={() => { setViewMode('table'); handleMenuClose(); }}>
            <ListItemIcon><ReceiptIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Table View</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setViewMode('cards'); handleMenuClose(); }}>
            <ListItemIcon><ViewIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Card View</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => { setShowFilters(!showFilters); handleMenuClose(); }}>
            <ListItemIcon><FilterListIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{showFilters ? 'Hide Filters' : 'Show Filters'}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { setShowRealizedOnly(!showRealizedOnly); handleMenuClose(); }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{showRealizedOnly ? 'Show All' : 'Bank Realized Only'}</ListItemText>
          </MenuItem>
        </Menu>
      </Box>
    </LocalizationProvider>
  );
};

export default ChequeReport2;