'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';

interface MantenixLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  withText?: boolean;
}

export default function MantenixLogo({ size = 'md', className = '', withText = false }: MantenixLogoProps) {
  const dimensions = {
    sm: { container: 'w-8 h-8', icon: 18, text: 'text-xs' },
    md: { container: 'w-11 h-11', icon: 26, text: 'text-sm' },
    lg: { container: 'w-16 h-16', icon: 38, text: 'text-lg' }
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative group cursor-pointer"
      >
        {/* Outer Industrial Frame (Precision Bevel) */}
        <div className={`${dimensions.container} bg-gradient-to-br from-[#1E2442] to-[#0C0F1A] rounded-2xl border border-[var(--border-color)] shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex items-center justify-center overflow-hidden transition-all group-hover:border-[#3B7EF8]/50 group-hover:shadow-[0_0_20px_rgba(59,126,248,0.2)]`}>
          
          {/* Internal Glow Base (Energy Core) */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[#3B7EF8] opacity-5 blur-2xl group-hover:opacity-10 transition-opacity" />
          
          {/* Precision Ring (Technical Detail) */}
          <div className="absolute inset-1 rounded-[14px] border border-[var(--border-color)] bg-[var(--bg-secondary)]/30 backdrop-blur-sm" />
          
          {/* Logo Asset with Tech Processing */}
          <div className="relative z-10 flex items-center justify-center">
            <Image 
              src="/logo-new.png" 
              alt="Mantenix Logo" 
              width={dimensions.icon} 
              height={dimensions.icon} 
              className="object-contain logo-tech-filter"
            />
          </div>

          {/* Scanning Line (Active Process Effect) */}
          <motion.div 
            animate={{ 
              top: ['-100%', '100%'],
              opacity: [0, 0.5, 0]
            }} 
            transition={{ 
              duration: 3, 
              repeat: Infinity, 
              ease: "linear" 
            }}
            className="absolute left-0 right-0 h-[10px] bg-gradient-to-b from-transparent via-[#3B7EF8]/40 to-transparent pointer-events-none z-20"
          />

          {/* Glitch/Energy Pulse in Hover */}
          <div className="absolute inset-0 bg-[#3B7EF8] opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300" />
        </div>

        {/* Ambient Backglow */}
        <div className="absolute -inset-2 bg-[#3B7EF8] blur-2xl opacity-0 group-hover:opacity-10 transition-opacity duration-500 rounded-full" />
      </motion.div>

      {withText && (
        <div className="flex flex-col">
          <span className={`font-black tracking-tighter text-white uppercase leading-none ${dimensions.text}`}>
            Mantenix
          </span>
          <span className="text-[8px] font-mono font-bold text-slate-500 tracking-[0.3em] uppercase mt-0.5">
            Operational Unit
          </span>
        </div>
      )}

      <style jsx global>{`
        .logo-tech-filter {
          filter: drop-shadow(0 0 10px rgba(59,126,248,0.5)) brightness(1.1) contrast(1.1);
          /* In high-end design, we help the logo blend if it has a white square background */
          /* mix-blend-mode: screen; */
        }
      `}</style>
    </div>
  );
}
