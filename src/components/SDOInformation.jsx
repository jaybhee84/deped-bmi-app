import React from 'react';
import { BMI_CLASSIFICATIONS, HAZ_CLASSIFICATIONS } from '../utils/bmi';
import './Settings.css';

export default function SDOInformation() {
  return (
    <div className="page">
      <h1 className="page-title">Information</h1>
      <p className="page-sub">BMI and Height-for-Age classification reference</p>

      <div className="settings-grid">
        <div className="card">
          <h3 className="card-title">BMI-for-Age Classification</h3>
          <p className="settings-ref-sub">
            Official WHO BMI-for-Age reference used by DepEd (age &amp; sex-specific, 6–19 years).
          </p>
          <div className="bmi-ref-list">
            {[
              { label: 'Severely Wasted', range: 'Below 16.0' },
              { label: 'Wasted',          range: '16.0 – 18.4' },
              { label: 'Normal',          range: '18.5 – 24.9' },
              { label: 'Overweight',      range: '25.0 – 29.9' },
              { label: 'Obese',           range: '30.0 and above' },
            ].map(item => {
              const cls = BMI_CLASSIFICATIONS.find(c => c.label === item.label);
              return (
                <div key={item.label} className="bmi-ref-row" style={{ background: cls?.bg }}>
                  <span className="bmi-ref-status" style={{ color: cls?.color }}>{item.label}</span>
                  <span className="bmi-ref-range"  style={{ color: cls?.color }}>{item.range}</span>
                </div>
              );
            })}
          </div>

          <h3 className="card-title" style={{ marginTop: '1.5rem' }}>Height-for-Age (HFA) Classification</h3>
          <p className="settings-ref-sub">Stunting classification by height vs age (3–19 years).</p>
          <div className="bmi-ref-list">
            {[
              { label: 'Severely Stunted', range: 'Below -3 SD' },
              { label: 'Stunted',          range: '-3 SD to -2 SD' },
              { label: 'Normal',           range: '-2 SD to +2 SD' },
              { label: 'Tall',             range: 'Above +2 SD' },
            ].map(item => {
              const cls = HAZ_CLASSIFICATIONS.find(c => c.label === item.label);
              return (
                <div key={item.label} className="bmi-ref-row" style={{ background: cls?.bg }}>
                  <span className="bmi-ref-status" style={{ color: cls?.color }}>{item.label}</span>
                  <span className="bmi-ref-range"  style={{ color: cls?.color }}>{item.range}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">About This System</h3>
          <div className="about-info">
            <div className="about-row"><span>System Name</span><span>DepEd BMI System</span></div>
            <div className="about-row"><span>Version</span><span>1.0.0</span></div>
            <div className="about-row"><span>Standard</span><span>WHO / DepEd</span></div>
            <div className="about-row"><span>Access Level</span><span>SDO / Division</span></div>
          </div>

          <h3 className="card-title" style={{ marginTop: '1.5rem' }}>Nutritional Status Indicators</h3>
          <p className="settings-ref-sub">Two indicators are used to assess learners:</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: '#1E3A5F', fontSize: 13 }}>📊 BMI-for-Age (BAZ)</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                Measures weight relative to height and age. Used to classify wasting and obesity.
              </div>
            </div>
            <div style={{ background: '#EAF3DE', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: '#3B6D11', fontSize: 13 }}>📏 Height-for-Age (HFA)</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                Measures height relative to age. Used to classify stunting — a sign of chronic malnutrition.
              </div>
            </div>
            <div style={{ background: '#FAEEDA', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, color: '#BA7517', fontSize: 13 }}>🍱 SBFP Beneficiaries</div>
              <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                School-Based Feeding Program targets Severely Wasted, Wasted, Stunted, and Severely Stunted learners.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
