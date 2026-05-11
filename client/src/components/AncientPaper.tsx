import React from 'react';
import '../styles/ancient-theme.css';

/**
 * Dream Writer - 传统线装书风格基础组件（增强版）
 * 提供古色古香的宣纸背景和古典边框装饰
 */

interface AncientPaperProps {
  children: React.ReactNode;
  variant?: 'writing' | 'reading' | 'decorative';
  className?: string;
}

export default function AncientPaper({
  children,
  variant = 'writing',
  className = ''
}: AncientPaperProps) {

  const getVariantClasses = () => {
    switch (variant) {
      case 'writing':
        return 'ancient-paper ink-writing-area';
      case 'reading':
        return 'ancient-paper ancient-scroll';
      case 'decorative':
        return 'ancient-paper';
      default:
        return 'ancient-paper';
    }
  };

  return (
    <div className={`${getVariantClasses()} ${className}`}>
      {children}
    </div>
  );
}

/**
 * 古典边框卡片组件（增强版）
 */
interface AncientCardProps {
  children: React.ReactNode;
  title?: string;
  seal?: string;
  className?: string;
}

export function AncientCard({
  children,
  title,
  seal,
  className = ''
}: AncientCardProps) {
  return (
    <div className={`ancient-card ${className}`}>
      {title && (
        <div className="ancient-title brush-stroke-effect" data-text={title}>
          {title}
        </div>
      )}
      {seal && (
        <div className="seal-stamp seal-stamp-small" style={{ position: 'absolute', top: '20px', right: '20px' }}>
          {seal}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * 印泥印章组件
 */
interface SealStampProps {
  text: string;
  size?: 'normal' | 'small';
  color?: 'red' | 'brown' | 'purple' | 'gold';
}

export function SealStamp({
  text,
  size = 'normal',
  color = 'red'
}: SealStampProps) {

  const getSizeClass = () => size === 'small' ? 'seal-stamp-small' : '';
  const getColorStyle = () => {
    switch (color) {
      case 'red':
        return {};
      case 'brown':
        return { borderColor: 'var(--seal-brown)', color: 'var(--seal-brown)' };
      case 'purple':
        return { borderColor: 'var(--silk-purple)', color: 'var(--silk-purple)' };
      case 'gold':
        return { borderColor: 'var(--seal-gold)', color: 'var(--seal-gold)' };
      default:
        return {};
    }
  };

  return (
    <span
      className={`seal-stamp ${getSizeClass()}`}
      style={getColorStyle()}
    >
      {text}
    </span>
  );
}

/**
 * 古风按钮组件（增强版）
 */
interface AncientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function AncientButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = ''
}: AncientButtonProps) {

  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return {};
      case 'secondary':
        return {
          background: 'linear-gradient(180deg, var(--paper-cream) 0%, var(--paper-warm) 100%)',
          color: 'var(--ink-dark)',
          borderColor: 'var(--border-antique)'
        };
      case 'outline':
        return {
          background: 'transparent',
          color: 'var(--ink-dark)',
          borderColor: 'var(--border-antique)'
        };
      default:
        return {};
    }
  };

  return (
    <button
      className={`ancient-button ${className}`}
      onClick={onClick}
      disabled={disabled || loading}
      style={getVariantStyle()}
    >
      {loading ? (
        <span className="ancient-loading" />
      ) : (
        <span className="brush-stroke-effect" data-text={children?.toString()}>
          {children}
        </span>
      )}
    </button>
  );
}

/**
 * 古典输入框组件（增强版）
 */
interface AncientInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AncientInput({
  value,
  onChange,
  placeholder = '请输入...',
  multiline = false,
  disabled = false,
  className = ''
}: AncientInputProps) {

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className={`ancient-input-wrapper ${className}`}>
      {multiline ? (
        <textarea
          className="ancient-input"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
        />
      ) : (
        <input
          type="text"
          className="ancient-input"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}
