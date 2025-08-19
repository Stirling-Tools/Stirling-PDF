import React from 'react';

interface SubcategoryHeaderProps {
  label: string;
  mt?: string | number;
  mb?: string | number;
}

export const SubcategoryHeader: React.FC<SubcategoryHeaderProps> = ({ label, mt = '1rem', mb = '0.25rem' }) => (
  <div className="tool-subcategory-row" style={{ marginLeft: '1rem', marginRight: '1rem', marginTop: mt, marginBottom: mb }}>
    <div className="tool-subcategory-row-rule" />
    <span className="tool-subcategory-row-title">{label}</span>
    <div className="tool-subcategory-row-rule" />
  </div>
);

export default SubcategoryHeader;
