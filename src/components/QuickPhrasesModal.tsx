import React, { useState } from 'react';
import { X, Sparkles, Volume2, Compass, AlertCircle, Utensils, ShoppingBag, MessageSquare } from 'lucide-react';
import { Language } from '../types/translator';

interface QuickPhrasesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPhrase: (phrase: string) => void;
  partnerLang: Language;
}

interface PhraseCategory {
  id: string;
  name: string;
  icon: any;
  phrases: string[];
}

const PHRASE_CATEGORIES: PhraseCategory[] = [
  {
    id: 'basic',
    name: 'Básicos & Diálogo',
    icon: MessageSquare,
    phrases: [
      'Hola, ¿habla español?',
      'Disculpe, ¿puede hablar más despacio?',
      'Muchas gracias por su ayuda',
      'Por favor, repita lo que dijo',
      'No le he entendido bien',
      'Un momento, estoy usando un traductor',
    ],
  },
  {
    id: 'directions',
    name: 'Direcciones & Transporte',
    icon: Compass,
    phrases: [
      '¿Dónde está la estación de tren o metro más cercana?',
      '¿Cuánto cuesta un taxi hasta el centro?',
      '¿Por dónde se va a esta dirección?',
      '¿Este autobús va al aeropuerto?',
      '¿Dónde puedo comprar un billete?',
    ],
  },
  {
    id: 'food',
    name: 'Restaurante & Comida',
    icon: Utensils,
    phrases: [
      'La cuenta, por favor',
      '¿Tienen menú en inglés o fotos?',
      '¿Tienen opciones vegetarianas o veganas?',
      'Soy alérgico a los frutos secos y gluten',
      '¿Me trae un vaso de agua, por favor?',
      '¿Qué plato típico me recomienda?',
    ],
  },
  {
    id: 'shopping',
    name: 'Compras & Dinero',
    icon: ShoppingBag,
    phrases: [
      '¿Cuánto cuesta esto?',
      '¿Aceptan tarjeta de crédito o sólo efectivo?',
      '¿Tiene una talla o tamaño más grande?',
      '¿Dónde hay un cajero automático cercano?',
      '¿Tiene recibo de compra?',
    ],
  },
  {
    id: 'emergency',
    name: 'Emergencias & Salud',
    icon: AlertCircle,
    phrases: [
      '¡Necesito ayuda urgente, por favor!',
      '¿Dónde está la farmacia más cercana?',
      'No me encuentro bien, necesito un médico',
      'He perdido mi pasaporte y cartera',
      'Por favor, llame a una ambulancia o a la policía',
    ],
  },
];

export const QuickPhrasesModal: React.FC<QuickPhrasesModalProps> = ({
  isOpen,
  onClose,
  onSelectPhrase,
  partnerLang,
}) => {
  const [activeCategory, setActiveCategory] = useState('basic');

  if (!isOpen) return null;

  const currentCategory =
    PHRASE_CATEGORIES.find((c) => c.id === activeCategory) || PHRASE_CATEGORIES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full sm:max-w-lg bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-slate-100 text-lg">Frases Rápidas</h3>
              <p className="text-xs text-slate-400">
                Toca para traducir y pronunciar en {partnerLang.name} {partnerLang.flag}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 rounded-full hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Categories Bar */}
        <div className="flex gap-2 p-3 overflow-x-auto border-b border-slate-800/80 bg-slate-950/40">
          {PHRASE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                  isSelected
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{cat.name}</span>
              </button>
            );
          })}
        </div>

        {/* Phrase List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {currentCategory.phrases.map((phrase, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelectPhrase(phrase);
                onClose();
              }}
              className="w-full text-left p-3.5 rounded-xl bg-slate-800/60 hover:bg-cyan-500/15 border border-slate-700/40 hover:border-cyan-500/40 text-slate-200 transition group flex items-center justify-between"
            >
              <span className="font-medium text-sm group-hover:text-cyan-200">
                {phrase}
              </span>
              <Volume2 className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
