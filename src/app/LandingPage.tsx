'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import NextImage from 'next/image';
import { 
  ArrowRight, CheckCircle2, Zap, Shield, BarChart3, 
  Users, Layers, Globe, Star, Play
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#1e1f21] overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative w-10 h-10">
              <NextImage src="/logo-new.png" alt="Mantenix Logo" fill className="object-contain" />
            </div>
            <span className="text-2xl font-black tracking-tight">Mantenix</span>
          </div>
          <div className="hidden md:flex items-center space-x-10 text-sm font-bold text-gray-600">
            <a href="#features" className="hover:text-[#0073ea] transition-colors">Características</a>
            <a href="#solutions" className="hover:text-[#0073ea] transition-colors">Soluciones</a>
            <a href="#pricing" className="hover:text-[#0073ea] transition-colors">Precios</a>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-sm font-bold text-gray-600 hover:text-[#0073ea] transition-colors px-4 py-2">
              Iniciar Sesión
            </Link>
            <Link href="/login" className="bg-primary text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-[#24614b] transition-all shadow-lg shadow-green-900/10 active:scale-95">
              Empezar Gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center space-x-2 bg-blue-50 text-[#0073ea] px-4 py-2 rounded-full text-xs font-bold mb-8 uppercase tracking-widest border border-blue-100">
              <Zap className="w-3 h-3" />
              <span>Nuevo: Automatizaciones con AI</span>
            </div>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-[1.1]">
              Gestiona tus<br />
              <span className="text-primary italic">flujos de trabajo</span> con Mantenix
            </h1>
            <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-12 font-medium leading-relaxed">
              La plataforma operativa que permite a los equipos crear aplicaciones de flujo de trabajo personalizadas en minutos. Más velocidad, menos fricción.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/login" className="w-full sm:w-auto bg-primary text-white px-10 py-5 rounded-full text-lg font-bold hover:bg-[#24614b] transition-all flex items-center justify-center shadow-xl shadow-green-900/20 group">
                Empezar ahora
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button className="w-full sm:w-auto bg-white border-2 border-gray-100 text-[#1e1f21] px-10 py-5 rounded-full text-lg font-bold hover:bg-gray-50 transition-all flex items-center justify-center">
                <Play className="w-5 h-5 mr-3 fill-current text-primary" />
                Ver demo
              </button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-20 relative"
          >
            <div className="absolute inset-0 bg-blue-500/10 blur-[120px] rounded-full -z-10 mx-auto w-2/3 h-2/3"></div>
            <div className="bg-white rounded-[2rem] p-3 shadow-2xl border border-gray-200 overflow-hidden relative">
               {/* Decorative Sidebar */}
               <div className="aspect-[16/10] bg-[#f5f6f8] rounded-2xl relative overflow-hidden flex">
                  {/* Mock Sidebar */}
                  <div className="w-16 md:w-20 bg-[#1e1f21] h-full flex flex-col items-center py-6 space-y-6">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold">M</div>
                    <div className="w-8 h-2 bg-gray-700 rounded-full"></div>
                    <div className="w-8 h-2 bg-gray-700 rounded-full"></div>
                    <div className="w-8 h-2 bg-gray-700 rounded-full"></div>
                    <div className="flex-1"></div>
                    <div className="w-8 h-8 bg-gray-800 rounded-full"></div>
                  </div>

                  {/* Mock Content */}
                  <div className="flex-1 p-6 md:p-10 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                      <div className="space-y-2">
                        <div className="w-32 md:w-48 h-4 bg-gray-200 rounded-full"></div>
                        <div className="w-20 md:w-24 h-2 bg-gray-200 rounded-full"></div>
                      </div>
                      <div className="flex -space-x-2">
                        {[1, 2, 3].map(i => (
                          <div key={i} className={`w-8 h-8 rounded-full border-2 border-white ${['bg-red-400', 'bg-blue-400', 'bg-green-400'][i-1]}`}></div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col justify-center">
                        <div className="flex items-center justify-between mb-4">
                           <div className="w-24 h-3 bg-gray-100 rounded-full"></div>
                           <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        </div>
                        <div className="space-y-4">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <div className={`w-3 h-3 rounded-sm ${['bg-blue-400', 'bg-purple-400', 'bg-orange-400'][i-1]}`}></div>
                                <div className="w-16 md:w-32 h-2.5 bg-gray-50 rounded-full"></div>
                              </div>
                              <div className={`w-12 h-4 rounded-full ${['bg-green-100 text-green-600', 'bg-blue-100 text-blue-600', 'bg-gray-100 text-gray-600'][i-1]} text-[8px] font-bold flex items-center justify-center uppercase`}>
                                {['Done', 'Working', 'Queue'][i-1]}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
                        <div className="relative w-24 h-24 md:w-32 md:h-32 mb-4">
                           <svg className="w-full h-full transform -rotate-90">
                              <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-gray-100" />
                              <circle cx="50%" cy="50%" r="45%" stroke="currentColor" strokeWidth="8" fill="transparent" strokeDasharray="283" strokeDashoffset="70" className="text-primary transition-all duration-1000" />
                           </svg>
                           <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className="text-xl md:text-2xl font-black text-primary">75%</span>
                              <span className="text-[10px] text-gray-400 font-bold uppercase">KPI Global</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating Notification */}
                  <motion.div 
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 1, type: 'spring' }}
                    className="absolute bottom-6 right-6 md:bottom-10 md:right-10 bg-white p-4 md:p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center space-x-4 border border-gray-50 z-20"
                  >
                    <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-green-500/30">
                      <CheckCircle2 className="w-6 h-6 md:w-7 md:h-7" />
                    </div>
                    <div>
                      <div className="text-[10px] md:text-xs text-gray-400 font-bold uppercase tracking-wider">Flujo Completado</div>
                      <div className="text-sm md:text-base font-black text-[#1e1f21]">Despliegue Mantenix v1.0</div>
                    </div>
                  </motion.div>

                  {/* Glass Card Overlay */}
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-500/5 blur-[80px] -z-10"></div>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Logos Section */}
      <section className="py-20 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mb-10">Confiado por equipos de elite</p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all">
             <div className="flex items-center space-x-2"><Layers className="w-8 h-8" /><span className="text-2xl font-bold">StackOS</span></div>
             <div className="flex items-center space-x-2"><Globe className="w-8 h-8" /><span className="text-2xl font-bold">NexFlow</span></div>
             <div className="flex items-center space-x-2"><Shield className="w-8 h-8" /><span className="text-2xl font-bold">CyberPort</span></div>
             <div className="flex items-center space-x-2"><BarChart3 className="w-8 h-8" /><span className="text-2xl font-bold">DataCore</span></div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black mb-6">Todo lo que necesitas para ganar</h2>
            <p className="text-gray-500 text-xl max-w-2xl mx-auto">Mantenix integra todas las herramientas de productividad en una única plataforma colaborativa.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { icon: Zap, title: 'Velocidad Absurda', desc: 'Automatiza tareas repetitivas en segundos sin escribir una sola línea de código.' },
              { icon: Users, title: 'Colaboración Real', desc: 'Todo el equipo sincronizado en tiempo real. Se acabó el caos de los emails.' },
              { icon: BarChart3, title: 'Insights Poderosos', desc: 'Visualiza el progreso de tus proyectos con dashboards dinámicos y reportes automáticos.' }
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-3xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 group">
                <div className="w-14 h-14 bg-blue-50 text-[#0073ea] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <f.icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4">{f.title}</h3>
                <p className="text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32">
        <div className="max-w-5xl mx-auto px-6">
          <div className="bg-[#1e1f21] rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
            <h2 className="text-4xl md:text-6xl font-extrabold text-white mb-8">¿Listo para transformar<br />tu equipo?</h2>
            <p className="text-[#a1a1a6] text-xl mb-12 max-w-xl mx-auto">Únete a más de 100,000 equipos que ya están usando Mantenix para escalar sus operaciones.</p>
            <Link href="/login" className="bg-white text-[#1e1f21] px-12 py-5 rounded-full text-xl font-bold hover:bg-gray-100 transition-all flex items-center justify-center mx-auto w-full sm:w-auto shadow-2xl">
              Empezar ahora — Es gratis
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center space-x-3">
            <div className="relative w-10 h-10">
              <NextImage src="/logo-new.png" alt="Mantenix Logo" fill className="object-contain" />
            </div>
            <span className="text-xl font-black">Mantenix</span>
          </div>
          <div className="flex space-x-8 text-sm font-bold text-gray-400">
            <a href="#" className="hover:text-gray-900">Twitter</a>
            <a href="#" className="hover:text-gray-900">LinkedIn</a>
            <a href="#" className="hover:text-gray-900">GitHub</a>
          </div>
          <div className="text-sm text-gray-400 font-medium">
            © 2026 Mantenix Inc. Hecho con ❤️ para equipos modernos.
          </div>
        </div>
      </footer>
    </div>
  );
}
