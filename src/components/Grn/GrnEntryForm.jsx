import React, { useState, useEffect, useRef } from 'react';
import { 
  submitGrnEntry, 
  getGrnEntriesByCode, 
  deleteGrnEntry, 
  fetchGrnBalances, 
  fetchNotChangingGRNs 
} from '../../services/api';
import GrnEntriesTable from './GrnEntriesTable';

const GrnEntryForm = () => {
  // === Shared State (from GrnEntryPage) ===
  const [notChangingGRNs, setNotChangingGRNs] = useState([]);
  const [grnEntries, setGrnEntries] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [balances, setBalances] = useState({ total_packs: 0, total_weight: 0 });

  // === Local Form State ===
  const [formData, setFormData] = useState({
    code: '',
    packs: '',
    weight: '',
    per_kg_price: '',
    grn_no: ''
  });
  const [itemInfo, setItemInfo] = useState('');
  const [relatedEntries, setRelatedEntries] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const packsRef = useRef(null);
  const weightRef = useRef(null);
  const priceRef = useRef(null);
  const codeSelectRef = useRef(null);

  // === Initial Load ===
  useEffect(() => {
    loadNotChangingGRNs();
  }, []);

  const loadNotChangingGRNs = async () => {
    try {
      const data = await fetchNotChangingGRNs();
      setNotChangingGRNs(data);
    } catch (error) {
      console.error('Failed to load GRNs:', error);
    }
  };

  // === Balance & Entry Management ===
  const updateBalances = async (code) => {
    if (!code) return;
    try {
      const balanceData = await fetchGrnBalances(code);
      setBalances(balanceData);
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    }
  };

  const handleCodeSelect = (code) => {
    setSelectedCode(code);
    updateBalances(code);
  };

  const addGrnEntry = (newEntry) => {
    setGrnEntries(prev => [newEntry, ...prev]);
  };

  const removeGrnEntry = (id) => {
    setGrnEntries(prev => prev.filter(entry => entry.id !== id));
  };

  // === Form Logic ===
  useEffect(() => {
    if (codeSelectRef.current) codeSelectRef.current.focus();
  }, []);

  const fetchRelatedEntries = async (code) => {
    try {
      const response = await getGrnEntriesByCode(code);
      setRelatedEntries(response.data || []);
    } catch (error) {
      console.error('Error fetching GRN entries:', error);
    }
  };

  const handleCodeChange = async (e) => {
    const selectedValue = e.target.value;
    const selectedOption = e.target.options[e.target.selectedIndex];
    setFormData(prev => ({ ...prev, code: selectedValue }));

    if (selectedValue) {
      const itemName = selectedOption.getAttribute('data-item-name');
      const grnNo = selectedOption.getAttribute('data-grn-no');
      const perKgPrice = selectedOption.getAttribute('data-perkg-price');

      setFormData(prev => ({
        ...prev,
        code: selectedValue,
        per_kg_price: perKgPrice || '',
        grn_no: grnNo || ''
      }));
      setItemInfo(itemName || '');
      handleCodeSelect(selectedValue);

      await fetchRelatedEntries(selectedValue);
      setTimeout(() => packsRef.current?.focus(), 100);
    } else {
      setFormData(prev => ({ ...prev, per_kg_price: '', grn_no: '' }));
      setItemInfo('');
      setRelatedEntries([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
  e.preventDefault();
  try {
    const newEntry = await submitGrnEntry(formData);
    addGrnEntry(newEntry.entry);
    setFormData(prev => ({ ...prev, packs: '', weight: '', per_kg_price: '' }));
    setItemInfo('');
    updateBalances(formData.code);
    await fetchRelatedEntries(formData.code);
    setSearchTerm(''); // clear the input
  } catch (error) {
    alert('Error adding entry: ' + error.message);
  }
};


  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this entry?')) {
      try {
        await deleteGrnEntry(id);
        removeGrnEntry(id);
        setRelatedEntries(prev => prev.filter(entry => entry.id !== id));
      } catch (err) {
        console.error('Error deleting entry:', err);
        alert(err.message || 'Failed to delete entry');
      }
    }
  };

  const handleKeyDown = (e, nextField) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextField === 'submit') handleSubmit(e);
      else if (nextField && nextField.current) nextField.current.focus();
    }
  };

  // === Search Dropdown ===
  const filteredOptions = notChangingGRNs.filter(grn =>
    grn.code.toUpperCase().includes(searchTerm.toUpperCase()) ||
    grn.item_name.toUpperCase().includes(searchTerm.toUpperCase())
  );

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setShowDropdown(true);
  };

  const handleOptionSelect = (grn) => {
    setFormData(prev => ({
      ...prev,
      code: grn.code,
      per_kg_price: grn.PerKGPrice || '',
      grn_no: grn.grn_no || ''
    }));
    setItemInfo(grn.item_name);
    handleCodeSelect(grn.code);
    setSearchTerm(`${grn.code} - ${grn.item_name}`);
    setShowDropdown(false);
    fetchRelatedEntries(grn.code);
    setTimeout(() => packsRef.current?.focus(), 100);
  };

  // === Render ===
  return (
    <div className="container mt-4">
      <h3>
        GRN Entries{' '}
        <span className="balances">
          (Balanced Packs: {balances.total_packs}, Balanced Weight: {parseFloat(balances.total_weight).toFixed(2)} kg)
        </span>
      </h3>

      <form id="grn_form" onSubmit={handleSubmit} className="p-3 bg-light rounded shadow-sm mt-3">
        {/* Code Search Section */}
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <label className="form-label fw-bold">Code</label>
            <div className="position-relative">
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Search for a code or name..."
                value={searchTerm}
                onChange={handleSearchChange}
                onFocus={() => setShowDropdown(true)}
                style={{ textTransform: 'uppercase' }}
              />
              {showDropdown && searchTerm && (
                <div className="position-absolute w-100 bg-white border mt-1 shadow-sm"
                     style={{ zIndex: 1000, maxHeight: '200px', overflowY: 'auto' }}>
                  {filteredOptions.map(grn => (
                    <div key={grn.code} className="dropdown-item p-2" 
                         style={{ cursor: 'pointer', fontSize: '0.875rem' }}
                         onClick={() => handleOptionSelect(grn)}>
                      {grn.code} - {grn.item_name}
                    </div>
                  ))}
                  {filteredOptions.length === 0 && (
                    <div className="dropdown-item p-2 text-muted">No results found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="col-md-2">
            <label className="form-label fw-bold">Start Date</label>
            <input type="date" className="form-control form-control-sm" />
          </div>

          <div className="col-md-2">
            <label className="form-label fw-bold">End Date</label>
            <input type="date" className="form-control form-control-sm" />
          </div>
        </div>

        {/* Entry Fields */}
        <div className="row g-2 mb-3 align-items-end">
          <div className="col-md-3">
            <label className="form-label fw-bold">Item</label>
            <input type="text" value={itemInfo} className="form-control form-control-sm" readOnly />
          </div>

          <div className="col-md-2">
            <label className="form-label fw-bold">Packs</label>
            <input ref={packsRef} type="number" name="packs" value={formData.packs} onChange={handleInputChange}
              className="form-control form-control-sm" min="1"
              onKeyDown={(e) => handleKeyDown(e, weightRef)} />
          </div>

          <div className="col-md-2">
            <label className="form-label fw-bold">Weight (kg)</label>
            <input ref={weightRef} type="number" name="weight" value={formData.weight} onChange={handleInputChange}
              className="form-control form-control-sm" step="0.01"
              onKeyDown={(e) => handleKeyDown(e, priceRef)} />
          </div>

          <div className="col-md-2">
            <label className="form-label fw-bold">Per KG Price</label>
            <input ref={priceRef} type="number" name="per_kg_price" value={formData.per_kg_price} onChange={handleInputChange}
              className="form-control form-control-sm" step="0.01"
              onKeyDown={(e) => handleKeyDown(e, 'submit')} />
          </div>

          <div className="col-md-3">
            <label className="form-label fw-bold">GRN No</label>
            <input type="text" name="grn_no" value={formData.grn_no} className="form-control form-control-sm" readOnly />
          </div>
        </div>

        <div className="col-12 d-flex gap-2 mt-2">
          <button type="submit" className="btn btn-primary btn-sm">
            <i className="material-icons align-middle me-1">check_circle</i> Update GRN
          </button>
          <a href="/grn/create" className="btn btn-secondary btn-sm">
            <i className="material-icons align-middle me-1">add_circle</i> New GRN
          </a>
          <button type="button" className="btn btn-success btn-sm">Export Excel</button>
          <button type="button" className="btn btn-danger btn-sm">Export PDF</button>
        </div>
      </form>

      {/* Related Entries */}
      {relatedEntries.length > 0 && (
        <div className="mt-4 p-3 bg-white rounded shadow-sm">
          <h5>Related GRN Entries</h5>
          <div className="table-responsive">
            <table className="table table-striped table-bordered table-sm">
              <thead className="table-dark">
                <tr>
                  <th>GRN No</th>
                  <th>Packs</th>
                  <th>Weight</th>
                  <th>Per KG Price</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {relatedEntries.map(entry => (
                  <tr key={entry.id}>
                    <td>{entry.grn_no}</td>
                    <td>{entry.packs}</td>
                    <td>{entry.weight}</td>
                    <td>{entry.per_kg_price}</td>
                    <td>{(entry.packs * entry.weight * entry.per_kg_price).toFixed(2)}</td>
                    <td>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(entry.id)}>
                        <i className="material-icons align-middle">delete</i> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bottom GRN Table */}
      <GrnEntriesTable
        entries={grnEntries}
        selectedCode={selectedCode}
        onEntryDeleted={removeGrnEntry}
      />
    </div>
  );
};

export default GrnEntryForm;
