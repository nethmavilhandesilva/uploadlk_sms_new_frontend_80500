import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  CircularProgress,
  Tooltip,
  LinearProgress,
  useTheme,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterIcon,
  AttachMoney as MoneyIcon,
  People as PeopleIcon,
  Receipt as ReceiptIcon,
  CalendarToday as CalendarIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material';
import api from '../../api';

// ============================================
// API Service
// ============================================
const supplierAdvanceApi = {
  getAll: (params = {}) => api.get('/supplier-advances', { params }),
  create: (data) => api.post('/supplier-advances', data),
  getById: (id) => api.get(`/supplier-advances/${id}`),
  update: (id, data) => api.put(`/supplier-advances/${id}`, data),
  delete: (id) => api.delete(`/supplier-advances/${id}`),
  getDashboardStats: () => api.get('/supplier-advances/dashboard-stats'),
  exportData: (params = {}) => api.get('/supplier-advances/export', { params }),
};

// ============================================
// Dashboard Stats
// ============================================
const DashboardStats = () => {
  const theme = useTheme();
  const [stats, setStats] = useState({
    total_advance: 0,
    this_month_advance: 0,
    last_month_advance: 0,
    total_suppliers: 0,
    total_travelers: 0,
    top_suppliers: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await supplierAdvanceApi.getDashboardStats();
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ title, value, icon: Icon, color }) => (
    <Card sx={{ height: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              bgcolor: `${color}15`,
              borderRadius: '12px',
              p: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon sx={{ color, fontSize: 28 }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );

  if (loading) {
    return <LinearProgress sx={{ mb: 3 }} />;
  }

  // Helper function to safely format numbers
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  const monthOverMonth = stats.last_month_advance > 0
    ? ((stats.this_month_advance - stats.last_month_advance) / stats.last_month_advance * 100).toFixed(1)
    : 0;

  return (
    <Grid container spacing={3} sx={{ mb: 3 }}>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <StatCard
          title="Total Advances"
          value={`Rs ${formatCurrency(stats.total_advance)}`}
          icon={MoneyIcon}
          color={theme.palette.primary.main}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <StatCard
          title="This Month"
          value={`Rs ${formatCurrency(stats.this_month_advance)}`}
          icon={CalendarIcon}
          color={theme.palette.success.main}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <StatCard
          title="Suppliers"
          value={stats.total_suppliers || 0}
          icon={PeopleIcon}
          color={theme.palette.info.main}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6, md: 3 }}>
        <StatCard
          title="Travelers"
          value={stats.total_travelers || 0}
          icon={ReceiptIcon}
          color={theme.palette.warning.main}
        />
      </Grid>
    </Grid>
  );
};

// ============================================
// Advance Form
// ============================================
const AdvanceForm = ({ mode = 'create', advance = null, onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    supplier_code: '',
    supplier_bill_no: '',
    traveler_code: '',
    advance_amount: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === 'edit' && advance) {
      setFormData({
        supplier_code: advance.supplier_code || '',
        supplier_bill_no: advance.supplier_bill_no || '',
        traveler_code: advance.traveler_code || '',
        advance_amount: advance.advance_amount || '',
      });
    }
  }, [mode, advance]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.supplier_code.trim()) newErrors.supplier_code = 'Supplier code required';
    if (!formData.traveler_code.trim()) newErrors.traveler_code = 'Traveler code required';
    if (!formData.advance_amount || parseFloat(formData.advance_amount) <= 0) {
      newErrors.advance_amount = 'Amount must be greater than 0';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const data = { ...formData, advance_amount: parseFloat(formData.advance_amount) };
      const response = mode === 'create'
        ? await supplierAdvanceApi.create(data)
        : await supplierAdvanceApi.update(advance.id, data);

      if (response.data.success) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label="Supplier Code"
            name="supplier_code"
            value={formData.supplier_code}
            onChange={handleChange}
            error={!!errors.supplier_code}
            helperText={errors.supplier_code}
            required
            size="small"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label="Supplier Bill No"
            name="supplier_bill_no"
            value={formData.supplier_bill_no}
            onChange={handleChange}
            size="small"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label="Traveler Code"
            name="traveler_code"
            value={formData.traveler_code}
            onChange={handleChange}
            error={!!errors.traveler_code}
            helperText={errors.traveler_code}
            required
            size="small"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            fullWidth
            label="Advance Amount (Rs)"
            name="advance_amount"
            type="number"
            value={formData.advance_amount}
            onChange={handleChange}
            error={!!errors.advance_amount}
            helperText={errors.advance_amount}
            required
            size="small"
            slotProps={{
              input: {
                startAdornment: 'Rs ',
                inputProps: { step: '0.01', min: '0.01' },
              }
            }}
          />
        </Grid>
      </Grid>
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={loading}>
          {loading ? <CircularProgress size={20} /> : (mode === 'create' ? 'Create' : 'Update')}
        </Button>
      </Box>
    </Box>
  );
};

// ============================================
// Main Report Component
// ============================================
const Transport = () => {
  const theme = useTheme();
  const [advances, setAdvances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ page: 0, rowsPerPage: 15, total: 0 });
  const [filters, setFilters] = useState({
    supplier_code: '',
    supplier_bill_no: '',
    traveler_code: '',
    start_date: '',
    end_date: '',
    min_amount: '',
    max_amount: '',
    sort_by: 'created_at',
    sort_order: 'desc',
  });
  const [summary, setSummary] = useState({
    total_advance: 0,
    average_advance: 0,
    total_records: 0,
    max_advance: 0,
    min_advance: 0,
  });
  const [showForm, setShowForm] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState(null);
  const [formMode, setFormMode] = useState('create');
  const [showFilters, setShowFilters] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  // Fetch data
  const fetchAdvances = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page: pagination.page + 1,
        per_page: pagination.rowsPerPage,
      };
      const response = await supplierAdvanceApi.getAll(params);
      if (response.data.success) {
        const { data } = response.data;
        setAdvances(data.advances.data || []);
        setPagination(prev => ({ ...prev, total: data.advances.total || 0 }));
        setSummary(data.summary || {});
      }
    } catch (error) {
      console.error('Error:', error);
      showSnackbar('Failed to fetch data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Delete
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this advance?')) return;
    try {
      await supplierAdvanceApi.delete(id);
      showSnackbar('Deleted successfully', 'success');
      fetchAdvances();
    } catch (error) {
      showSnackbar('Delete failed', 'error');
    }
  };

  // Export
  const handleExport = async () => {
    try {
      const response = await supplierAdvanceApi.exportData(filters);
      if (response.data.success) {
        const csvData = response.data.data;
        const headers = ['Supplier Code', 'Supplier Bill No', 'Traveler Code', 'Advance Amount (Rs)', 'Created At'];
        const rows = csvData.map(item => [
          item.supplier_code,
          item.supplier_bill_no || '-',
          item.traveler_code,
          item.advance_amount,
          new Date(item.created_at).toLocaleString(),
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `supplier-advances-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        showSnackbar('Exported successfully', 'success');
      }
    } catch (error) {
      showSnackbar('Export failed', 'error');
    }
  };

  // Helper function to safely format numbers
  const formatCurrency = (value) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0.00' : num.toFixed(2);
  };

  // Handlers
  const handleFilterChange = (field, value) => setFilters(prev => ({ ...prev, [field]: value }));
  const applyFilters = () => { setPagination(prev => ({ ...prev, page: 0 })); fetchAdvances(); };
  const resetFilters = () => {
    setFilters({
      supplier_code: '',
      supplier_bill_no: '',
      traveler_code: '',
      start_date: '',
      end_date: '',
      min_amount: '',
      max_amount: '',
      sort_by: 'created_at',
      sort_order: 'desc',
    });
    setPagination(prev => ({ ...prev, page: 0 }));
    setTimeout(fetchAdvances, 100);
  };
  const showSnackbar = (message, severity = 'success') => setSnackbar({ open: true, message, severity });
  const openForm = (mode = 'create', advance = null) => {
    setFormMode(mode);
    setSelectedAdvance(advance);
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setSelectedAdvance(null); };
  const handleFormSuccess = () => {
    closeForm();
    fetchAdvances();
    showSnackbar(formMode === 'create' ? 'Created successfully' : 'Updated successfully');
  };

  useEffect(() => {
    fetchAdvances();
  }, [pagination.page, pagination.rowsPerPage]);

  return (
    <Box sx={{ 
      width: '100%', 
      maxWidth: '100%', 
      px: 3, 
      py: 4,
      // Override any existing styles
      '& *': {
        boxSizing: 'border-box',
      },
      '& .MuiPaper-root': {
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        borderRadius: '12px',
      },
      '& .MuiTableCell-root': {
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      },
    }}>
      {/* Header */}
      <Paper
        sx={{
          p: 3,
          mb: 3,
          background: `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.primary.dark} 100%)`,
          color: 'white',
          borderRadius: '12px',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Supplier Advances
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
              Manage and track supplier advance payments
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => openForm('create')}
              sx={{
                bgcolor: 'white',
                color: theme.palette.primary.main,
                fontWeight: 600,
                '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' },
                textTransform: 'none',
              }}
            >
              New Advance
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExport}
              sx={{
                color: 'white',
                borderColor: 'white',
                textTransform: 'none',
                '&:hover': {
                  borderColor: 'rgba(255,255,255,0.7)',
                  bgcolor: 'rgba(255,255,255,0.1)',
                },
              }}
            >
              Export
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Dashboard Stats */}
      <DashboardStats />

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600 }}>
                Total Advances
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                Rs {formatCurrency(summary.total_advance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600 }}>
                Records
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                {summary.total_records || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600 }}>
                Average
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                Rs {formatCurrency(summary.average_advance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent sx={{ p: 2.5 }}>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600 }}>
                Range
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>
                Rs {formatCurrency(summary.min_advance)} - Rs {formatCurrency(summary.max_advance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
            <SearchIcon /> Filters
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <IconButton onClick={() => setShowFilters(!showFilters)} size="small">
              {showFilters ? <ClearIcon /> : <FilterIcon />}
            </IconButton>
            <Button variant="contained" startIcon={<SearchIcon />} onClick={applyFilters} size="small">
              Search
            </Button>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={resetFilters} size="small">
              Reset
            </Button>
          </Box>
        </Box>

        {showFilters && (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Supplier Code"
                value={filters.supplier_code}
                onChange={(e) => handleFilterChange('supplier_code', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Supplier Bill No"
                value={filters.supplier_bill_no}
                onChange={(e) => handleFilterChange('supplier_bill_no', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Traveler Code"
                value={filters.traveler_code}
                onChange={(e) => handleFilterChange('traveler_code', e.target.value)}
                size="small"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Min Amount (Rs)"
                type="number"
                value={filters.min_amount}
                onChange={(e) => handleFilterChange('min_amount', e.target.value)}
                size="small"
                slotProps={{
                  input: { startAdornment: 'Rs ' }
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Max Amount (Rs)"
                type="number"
                value={filters.max_amount}
                onChange={(e) => handleFilterChange('max_amount', e.target.value)}
                size="small"
                slotProps={{
                  input: { startAdornment: 'Rs ' }
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="Start Date"
                type="date"
                value={filters.start_date}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <TextField
                fullWidth
                label="End Date"
                type="date"
                value={filters.end_date}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Sort By</InputLabel>
                <Select
                  value={filters.sort_by}
                  onChange={(e) => handleFilterChange('sort_by', e.target.value)}
                  label="Sort By"
                >
                  <MenuItem value="created_at">Created At</MenuItem>
                  <MenuItem value="advance_amount">Amount</MenuItem>
                  <MenuItem value="supplier_code">Supplier Code</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Order</InputLabel>
                <Select
                  value={filters.sort_order}
                  onChange={(e) => handleFilterChange('sort_order', e.target.value)}
                  label="Order"
                >
                  <MenuItem value="asc">Ascending</MenuItem>
                  <MenuItem value="desc">Descending</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        )}
      </Paper>

      {/* Data Table */}
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>#</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Supplier Code</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Bill No</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Traveler Code</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Amount (Rs)</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Created At</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : advances.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                    <Typography color="textSecondary">No advances found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                advances.map((advance, index) => (
                  <TableRow key={advance.id} hover>
                    <TableCell>{pagination.page * pagination.rowsPerPage + index + 1}</TableCell>
                    <TableCell>
                      <Chip label={advance.supplier_code} size="small" color="primary" />
                    </TableCell>
                    <TableCell>{advance.supplier_bill_no || '-'}</TableCell>
                    <TableCell>
                      <Chip label={advance.traveler_code} size="small" color="secondary" />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      Rs {formatCurrency(advance.advance_amount)}
                    </TableCell>
                    <TableCell>
                      {new Date(advance.created_at).toLocaleDateString()}
                      <Typography variant="caption" display="block" color="textSecondary">
                        {new Date(advance.created_at).toLocaleTimeString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edit">
                        <IconButton size="small" color="primary" onClick={() => openForm('edit', advance)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => handleDelete(advance.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 15, 25, 50, 100]}
          component="div"
          count={pagination.total}
          rowsPerPage={pagination.rowsPerPage}
          page={pagination.page}
          onPageChange={(_, newPage) => setPagination(prev => ({ ...prev, page: newPage }))}
          onRowsPerPageChange={(e) => setPagination({ page: 0, rowsPerPage: parseInt(e.target.value, 10), total: pagination.total })}
        />
      </Paper>

      {/* Form Dialog */}
      <Dialog open={showForm} onClose={closeForm} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {formMode === 'create' ? 'Create New Advance' : 'Edit Advance'}
        </DialogTitle>
        <DialogContent>
          <AdvanceForm
            mode={formMode}
            advance={selectedAdvance}
            onSuccess={handleFormSuccess}
            onCancel={closeForm}
          />
        </DialogContent>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Transport;