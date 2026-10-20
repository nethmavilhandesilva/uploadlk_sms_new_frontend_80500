import React, { useState, useEffect } from 'react';
import { deleteGrnEntry } from '../../services/api';

const GrnEntriesTable = ({ entries, selectedCode, onEntryDeleted }) => {
  const [filteredEntries, setFilteredEntries] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    filterEntries();
  }, [entries, selectedCode, startDate, endDate]);

  const filterEntries = () => {
    let filtered = entries;
    
    if (selectedCode) {
      filtered = filtered.filter(entry => entry.code === selectedCode);
    }
    
    if (startDate) {
      filtered = filtered.filter(entry => new Date(entry.txn_date) >= new Date(startDate));
    }
    
    if (endDate) {
      filtered = filtered.filter(entry => new Date(entry.txn_date) <= new Date(endDate));
    }
    
    // Sort by ID descending
    filtered.sort((a, b) => b.id - a.id);
    
    setFilteredEntries(filtered);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    
    try {
      await deleteGrnEntry(id);
      onEntryDeleted(id);
    } catch (error) {
      alert('Delete failed: ' + error.message);
    }
  };

  if (filteredEntries.length === 0) {
    return null;
  }

  return (
    <table className="table table-bordered table-striped" id="grn_table">
      <thead className="table-dark">
        <tr>
          <th>ID</th>
          <th>Code</th>
          <th>Supplier Code</th>
          <th>Item Code</th>
          <th>Item Name</th>
          <th>Packs</th>
          <th>Weight (kg)</th>
          <th>Per KG Price</th>
          <th>Txn Date</th>
          <th>GRN No</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {filteredEntries.map(entry => (
          <tr key={entry.id}>
            <td>{entry.id}</td>
            <td>{entry.code}</td>
            <td>{entry.supplier_code}</td>
            <td>{entry.item_code}</td>
            <td>{entry.item_name}</td>
            <td>{entry.packs}</td>
            <td>{entry.weight}</td>
            <td>{entry.per_kg_price}</td>
            <td>{entry.txn_date}</td>
            <td>{entry.grn_no}</td>
            <td>
              <button 
                className="btn btn-danger btn-sm delete-btn"
                onClick={() => handleDelete(entry.id)}
              >
                <i className="material-icons align-middle">delete</i>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default GrnEntriesTable;