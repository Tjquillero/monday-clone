'use client';

import { motion } from 'framer-motion';

interface MantenixLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  withText?: boolean;
}

export default function MantenixLogo({ size = 'md', className = '', withText = false }: MantenixLogoProps) {
  const pixelSizes = {
    sm: 24,
    md: 32,
    lg: 44,
  }[size];

  const textClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl',
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative group cursor-pointer flex-shrink-0"
        title="Mantenix"
      >
        {size === 'sm' ? (
          /* Micro-mark oficial para escalas pequeñas (16–24 px) */
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 32 32" 
            width={pixelSizes} 
            height={pixelSizes}
            className="block drop-shadow-sm"
          >
            <circle cx="16" cy="16" r="15" fill="#0B2A4A" />
            <path 
              d="M 7 21 C 9 18, 11 19, 13 18 C 15 17, 16.5 12.5, 19.5 12.5 C 22.5 12.5, 23.5 18, 25.5 18" 
              fill="none" 
              stroke="#FFFFFF" 
              strokeWidth="2.2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            <circle cx="19.5" cy="12.5" r="2.2" fill="#E8792F" stroke="#FFFFFF" strokeWidth="0.8" />
          </svg>
        ) : (
          /* Símbolo oficial para escalas medianas y grandes (≥ 26 px) */
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 512 512" 
            width={pixelSizes} 
            height={pixelSizes}
            className="block drop-shadow-sm"
          >
            <circle cx="256" cy="256" r="240" fill="#0B2A4A" />
            <path 
              d="M 120 330 C 145 285, 175 295, 205 280 C 235 265, 260 200, 310 200 C 355 200, 375 280, 400 280" 
              fill="none" 
              stroke="#FFFFFF" 
              strokeWidth="28" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
            />
            <circle cx="310" cy="200" r="24" fill="#E8792F" stroke="#FFFFFF" strokeWidth="6" />
          </svg>
        )}
      </motion.div>

      {withText && (
        <div className="flex flex-col select-none">
          <span className={`brand-title tracking-tight text-[var(--text-primary)] leading-none ${textClasses}`}>
            Mantenix
          </span>
          <span className="text-[9px] font-sans font-semibold text-[var(--text-muted)] tracking-[0.18em] uppercase mt-0.5">
            Operaciones
          </span>
        </div>
      )}
    </div>
  );
}
