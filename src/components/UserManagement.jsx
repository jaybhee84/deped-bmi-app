import React, { useState } from 'react';
import {
  loadUsers, addUser, deleteUser, updateUser,
  ROLES, SCHOOL_POSITIONS, DIVISION_POSITIONS,
} from '../utils/auth';
import Modal from './Modal';
import './UserManagement.css';

const emptyForm = {
  username: '', password: '', fullName: '',
  role: ROLES.SCHOOL, position: SCHOOL_POSITIONS[0],
};

export default function UserManagement({ currentUser }) {
  const [users,     setUsers]     = useState(loadUsers);
  const [addOpen,   setAddOpen]   = useState(false);
  const [editUser,  setEditUser]  = useState(null);
  const [form,      setForm]      = useState(emptyForm);
  const [error,     setError]     = useState('');
  const [confirmId, setConfirmId] = useState(null);

  function refresh() { setUsers(loadUsers()); }

  function handleRoleChange(role) {
    setForm(f => ({
      ...f,
      role,
      position: role === ROLES.SCHOOL
        ? SCHOOL_POSITIONS[0]
        : DIVISION_POSITIONS[0],
    }));
  }

  function openAdd() {
    setForm(emptyForm);
    setError('');
    setAddOpen(true);
  }

  function openEdit(user) {
    setForm({
      username: user.username,
      password: '',
      fullName: user.fullName,
      role:     user.role,
      position: user.position,
    });
    setError('');
    setEditUser(user);
  }

  function handleSaveNew() {
    if (!form.username.trim() || !form.password || !form.fullName.trim()) {
      setError('All fields are required.'); return;
    }
    const ok = addUser({
      username: form.username.trim(),
      password: form.password,
      fullName: form.fullName.trim(),
      role:     form.role,
      position: form.position,
    });
    if (!ok) { setError('Username already exists.'); return; }
    refresh();
    setAddOpen(false);
  }

  function handleSaveEdit() {
    if (!form.fullName.trim()) { setError('Full name is required.'); return; }
    const changes = {
      fullName: form.fullName.trim(),
      role:     form.role,
      position: form.position,
    };
    if (form.password) changes.password = form.password;
    updateUser(editUser.id, changes);
    refresh();
    setEditUser(null);
  }

  function handleDelete(id) {
    if (id === currentUser.id) return; // can't delete self
    deleteUser(id);
    refresh();
    setConfirmId(null);
  }

  const positions = form.role === ROLES.SCHOOL ? SCHOOL_POSITIONS : DIVISION_POSITIONS;

  const FormFields = () => (
    <div className="um-form">
      <div className="form-group">
        <label className="form-label">Full Name</label>
        <input className="form-input" placeholder="e.g. Maria Santos"
          value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
      </div>
      {!editUser && (
        <div className="form-group">
          <label className="form-label">Username</label>
          <input className="form-input" placeholder="e.g. msantos"
            value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
        </div>
      )}
      <div className="form-group">
        <label className="form-label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
        <input className="form-input" type="password" placeholder="Password"
          value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
      </div>
      <div className="um-form-row">
        <div className="form-group">
          <label className="form-label">Role</label>
          <select className="form-select full-width" value={form.role} onChange={e => handleRoleChange(e.target.value)}>
            <option value={ROLES.SCHOOL}>School</option>
            <option value={ROLES.DIVISION}>Division</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Position</label>
          <select className="form-select full-width" value={form.position}
            onChange={e => setForm(f => ({ ...f, position: e.target.value }))}>
            {positions.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="um-error">{error}</div>}
    </div>
  );

  return (
    <div className="um-section">
      <div className="um-header">
        <h3 className="card-title" style={{ margin: 0 }}>User Accounts</h3>
        <button className="btn btn-primary" onClick={openAdd}>+ Add User</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Position</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>
                {u.fullName}
                {u.id === currentUser.id && <span className="um-you-badge"> (you)</span>}
              </td>
              <td>{u.username}</td>
              <td>
                <span className={`um-role-badge ${u.role}`}>
                  {u.role === ROLES.SCHOOL ? '🏫 School' : '🏥 Division'}
                </span>
              </td>
              <td>{u.position}</td>
              <td className="um-actions">
                <button className="btn-small" onClick={() => openEdit(u)}>Edit</button>
                {u.id !== currentUser.id && (
                  <button className="btn-small btn-del" onClick={() => setConfirmId(u.id)}>Delete</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Add Modal */}
      {addOpen && (
        <Modal title="Add New User" onClose={() => setAddOpen(false)}>
          <FormFields />
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveNew}>Add User</button>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editUser && (
        <Modal title={`Edit — ${editUser.fullName}`} onClose={() => setEditUser(null)}>
          <FormFields />
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setEditUser(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveEdit}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {confirmId && (
        <Modal title="Confirm Delete" onClose={() => setConfirmId(null)}>
          <p style={{ fontSize: 14, color: 'var(--gray-700)', marginBottom: '1rem' }}>
            Are you sure you want to delete this user? This cannot be undone.
          </p>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setConfirmId(null)}>Cancel</button>
            <button className="btn" style={{ background: 'var(--red)', color: '#fff' }}
              onClick={() => handleDelete(confirmId)}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
