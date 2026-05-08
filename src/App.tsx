/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, 
  Sparkles, 
  Trash2, 
  Download, 
  History, 
  Shirt, 
  User, 
  Globe, 
  Camera,
  ChevronRight,
  Plus,
  ArrowRight,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Palette,
  X,
  Wand2,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import Papa from 'papaparse';
import { get, set } from 'idb-keyval';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface GenerationResult {
  id: string;
  originalImage: string;
  generatedImage: string;
  title: string;
  description: string;
  metaDescription: string;
  color: string;
  pattern: string;
  timestamp: number;
  options: GenerationOptions;
}

interface GenerationOptions {
  gender: string;
  race: string;
  pose: string;
  background: string;
}

const DEFAULT_OPTIONS: GenerationOptions = {
  gender: 'Female',
  race: 'Diverse',
  pose: 'Natural Standing',
  background: 'Zimbabalooba Studio'
};

// --- App Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'collection' | 'edit'>('studio');
  const [generations, setGenerations] = useState<GenerationResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [options, setOptions] = useState<GenerationOptions>(DEFAULT_OPTIONS);
  const [editingGeneration, setEditingGeneration] = useState<GenerationResult | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const aiRef = useRef<any>(null);

  useEffect(() => {
    // Load from IndexedDB
    const loadHistory = async () => {
      try {
        const saved = await get('zimbabalooba_history');
        if (saved) {
          setGenerations(saved);
        }
      } catch (e) {
        console.error("Failed to load history from IndexedDB", e);
        // Fallback to localStorage for migration
        const legacy = localStorage.getItem('zimbabalooba_history');
        if (legacy) {
          try {
            const parsed = JSON.parse(legacy);
            setGenerations(parsed);
            // Move it to IndexedDB
            await set('zimbabalooba_history', parsed);
            localStorage.removeItem('zimbabalooba_history');
          } catch (le) {
            console.error("Failed to parse legacy history", le);
          }
        }
      }
    };

    loadHistory();
    
    if (process.env.GEMINI_API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }, []);

  useEffect(() => {
    const saveHistory = async () => {
      try {
        await set('zimbabalooba_history', generations);
      } catch (e) {
        console.error("Failed to save history to IndexedDB", e);
      }
    };
    
    if (generations.length > 0) {
      saveHistory();
    }
  }, [generations]);

  const removeGeneration = (id: string) => {
    const newGens = generations.filter(g => g.id !== id);
    setGenerations(newGens);
    
    if (editingGeneration?.id === id) {
      setEditingGeneration(null);
      setActiveTab('studio');
    }
  };

  const handleApplyEdit = async (baseImage: string, maskDataUrl: string, editPrompt: string) => {
    if (!aiRef.current || !editingGeneration) return;
    setIsGenerating(true);
    try {
      const ai = aiRef.current;
      // Determine mime type of base image
      const baseMime = baseImage.split(';')[0].split(':')[1] || 'image/png';
      
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            parts: [
              { inlineData: { mimeType: baseMime, data: baseImage.split(',')[1] } },
              { inlineData: { mimeType: "image/png", data: maskDataUrl.split(',')[1] } },
              { text: `Modify the first image based on the prompt: "${editPrompt}". The second image provided is a monochrome mask where the white areas indicate exactly where the changes should occur. Ensure the lighting and textures match the original photo perfectly.` }
            ]
          }
        ],
        config: {
          imageConfig: {
            aspectRatio: "3:4"
          }
        }
      });

      let generatedImgBase64 = '';
      const parts = result.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          generatedImgBase64 = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (generatedImgBase64) {
        const updatedGen: GenerationResult = {
          ...editingGeneration,
          id: crypto.randomUUID(),
          generatedImage: generatedImgBase64,
          timestamp: Date.now()
        };
        setGenerations([updatedGen, ...generations]);
        setEditingGeneration(null);
        setActiveTab('studio');
      } else {
        throw new Error("No image generated");
      }
    } catch (e) {
      console.error("Edit failed", e);
      alert("Failed to modify image. The AI might be busy or the request hit a filter.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomBackground(reader.result as string);
        setOptions(prev => ({ ...prev, background: 'Custom Upload' }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateProduct = async () => {
    if (!uploadedImage || !aiRef.current) return;
    setIsGenerating(true);
    try {
      const ai = aiRef.current;
      const contentResult = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: uploadedImage.split(',')[1] } },
              { text: "You are an expert fashion copywriter and style analyst for Zimbabalooba Fashion Tailor. Analyze this flat lay garment with extreme precision. Maintain 1:1 fabric texture, color saturation, and seam details. Generate a response in JSON format: { \"title\": \"...\", \"description\": \"...\", \"metaDescription\": \"...\", \"color\": \"...\", \"pattern\": \"...\", \"imagePrompt\": \"...\" }. IMPORTANT: The imagePrompt must specify that all tops are NEATLY TUCKED INTO the waistband and models are strictly BAREFOOT (no shoes, no socks). Describe how the garment should drape naturally on a model form." }
            ]
          }
        ],
        config: { responseMimeType: "application/json" }
      });

      const content = JSON.parse(contentResult.text);
      const imageParts: any[] = [{ inlineData: { mimeType: "image/jpeg", data: uploadedImage.split(',')[1] } }];

      if (customBackground && options.background === 'Custom Upload') {
        imageParts.push({ inlineData: { mimeType: "image/jpeg", data: customBackground.split(',')[1] } });
      }

      const backgroundInstruction = options.background === 'Custom Upload' 
        ? "Use the second image provided as the specific background environment."
        : options.background === 'Zimbabalooba Studio'
          ? "Setting: Zimbabalooba Studio. Backdrop: Subdued off-white plastered wall with visible organic texture. Flooring: Flat, matte white concrete floor. Signature Accent: A seaside-worn, weathered natural wood louvered door positioned to the side. Lighting: Soft, diffused natural morning light with minimal harsh shadows. Boutique editorial aesthetic."
          : options.background === 'Outdoor Scene'
            ? "Setting: A serene outdoor seaside environment. Subdued morning light. Soft sand or weathered coastal terrain. Natural organic textures. Boutique editorial aesthetic."
            : `Background: ${options.background}`;

      const poseInstruction = options.pose === 'Natural Standing' 
        ? "Relaxed pose, slightly facing away from the camera, leaning slightly with a soft expression. Boutique editorial style."
        : options.pose === 'Leaning against wall'
          ? "The model is leaning casually against the textured plastered wall, body slightly angled for a relaxed yet high-fashion look."
          : options.pose === 'One hand in pocket'
            ? "Classic editorial pose with one hand in the pocket, shoulders slightly dropped, looking directly at the camera with a soft confident expression."
            : options.pose;

      imageParts.push({
        text: `Create a photorealistic boutique fashion editorial of a ${options.gender} model (${options.race}) wearing the garment from the first image. Pose: ${poseInstruction}. ${backgroundInstruction}. Brand Rules: All tops MUST be neatly tucked into the waistband. Model MUST be barefoot. Maintain 1:1 fabric texture and color fidelity from source. ${content.imagePrompt}`
      });

      const imageResult = await ai.models.generateContent({ 
        model: "gemini-2.5-flash-image", 
        contents: [{ parts: imageParts }],
        config: {
          imageConfig: {
            aspectRatio: "3:4"
          }
        }
      });
      
      let generatedImgBase64 = '';
      for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          generatedImgBase64 = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!generatedImgBase64) throw new Error("No image");

      const newGen: GenerationResult = {
        id: crypto.randomUUID(),
        originalImage: uploadedImage,
        generatedImage: generatedImgBase64,
        title: content.title,
        description: content.description,
        metaDescription: content.metaDescription,
        color: content.color || '',
        pattern: content.pattern || '',
        timestamp: Date.now(),
        options: { ...options }
      };

      setGenerations([newGen, ...generations]);
      
      setActiveTab('studio');
      setUploadedImage(null);
    } catch (e) {
      console.error(e);
      alert("Failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadWooCommerceCSV = () => {
    const csvData = generations.map(gen => ({
      'SKU': `ZBT-${gen.id.slice(0, 8).toUpperCase()}`,
      'Name': gen.title,
      'Published': 1,
      'Is featured?': 0,
      'Visibility in catalog': 'visible',
      'Short description': gen.metaDescription,
      'Description': gen.description,
      'In stock?': 1,
      'Regular price': '129.00',
      'Categories': `Zimbabalooba Tailor > ${gen.options.gender}`,
      'Tags': `${gen.options.race}, ${gen.options.pose}, ${gen.color}, ${gen.pattern}`,
      'Images': gen.generatedImage,
      'Type': 'simple',
      'Attribute 1 name': 'Gender', 
      'Attribute 1 value(s)': gen.options.gender, 
      'Attribute 1 visible': 1, 
      'Attribute 1 global': 1,
      'Attribute 2 name': 'Diversity', 
      'Attribute 2 value(s)': gen.options.race, 
      'Attribute 2 visible': 1, 
      'Attribute 2 global': 1
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `zimbabalooba_woocommerce_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen w-screen bg-[#ede6e6] overflow-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#ede6e6] border-b border-border-main z-40">
        <div className="flex items-center gap-2">
          <Shirt className="text-brand-primary w-6 h-6" />
          <h1 className="text-[28px] font-bold tracking-tighter text-brand-primary lowercase mb-[5px] font-sans">zimbabalooba</h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-[12px] font-bold uppercase tracking-widest text-brand-primary border-2 border-double border-current py-1 px-3"
          >
            Upload Image Menu
          </button>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {mobileMenuOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-[#ede6e6] border-r border-border-main flex flex-col p-6 shrink-0 h-full overflow-y-auto transition-transform duration-300 lg:static lg:translate-x-0 lg:z-0",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="hidden lg:flex items-center gap-2 mb-8">
          <Shirt className="text-brand-primary w-8 h-8" />
          <h1 className="text-xl font-black tracking-tighter text-brand-primary lowercase italic">zimbabalooba</h1>
        </div>

        {!uploadedImage ? (
          <label className="group flex flex-col items-center justify-center py-8 border-2 border-dashed border-border-main rounded-2xl cursor-pointer hover:bg-accent-subtle transition-all mb-6 bg-white shrink-0">
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <Upload className="w-6 h-6 text-brand-primary mb-2" />
            <span className="font-bold uppercase text-[10px] tracking-widest text-text-muted">Upload Flat Lay</span>
          </label>
        ) : (
          <div className="relative aspect-square rounded-2xl overflow-hidden mb-6 border border-border-main shadow-sm shrink-0">
            <img src={uploadedImage} className="w-full h-full object-cover" alt="source" />
            <button onClick={() => setUploadedImage(null)} className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"><RefreshCcw className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="space-y-5">
          <OptionGroup label="Model" options={['Female', 'Male', 'Non-binary']} value={options.gender} onChange={(v: string) => setOptions({...options, gender: v})} />
          <OptionGroup label="Diversity" options={['Diverse', 'Black', 'Asian', 'Middle Eastern', 'Caucasian', 'Hispanic']} value={options.race} onChange={(v: string) => setOptions({...options, race: v})} />
          <OptionGroup label="Photography" options={['Natural Standing', 'Leaning against wall', 'One hand in pocket', 'Both hands in pockets']} value={options.pose} onChange={(v: string) => setOptions({...options, pose: v})} />
          <div className="space-y-3">
            <OptionGroup label="Environment" options={['Zimbabalooba Studio', 'Outdoor Scene', 'Urban Streetscape']} value={options.background} onChange={(v: string) => setOptions({...options, background: v})} />
            <label className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border-main cursor-pointer text-[10px] font-bold uppercase hover:bg-accent-subtle transition-all">
              <input type="file" className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
              <Camera className="w-4 h-4" />
              Custom Background
            </label>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-4 lg:p-6 overflow-hidden relative">
        <div className="flex items-center gap-4 lg:gap-8 border-b border-border-main mb-6 shrink-0 overflow-x-auto no-scrollbar">
          {(['studio', 'collection', 'edit'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setMobileMenuOpen(false); }} className={cn("pb-4 font-bold uppercase text-[10px] lg:text-xs tracking-widest relative transition-all whitespace-nowrap", activeTab === tab ? "text-brand-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-accent" : "text-text-muted")}>
              {tab === 'edit' ? 'Edit Image' : tab}
            </button>
          ))}
          <button 
            onClick={downloadWooCommerceCSV} 
            disabled={generations.length === 0} 
            className="ml-auto flex items-center gap-2 text-[7px] pt-[5px] pb-[5px] pl-[10px] pr-[10px] bg-[#f7941d] text-white rounded-[5px] border-none mb-[14px] uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-[20px] h-[20px]" /> CSV for WooCommerce
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'studio' ? (
              <motion.div key="studio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 h-full">
                <div className="aspect-[2/3] lg:aspect-auto flex-1 bg-accent-subtle rounded-3xl overflow-hidden shadow-sm relative group flex items-center justify-center">
                  {generations.length > 0 && !isGenerating ? (
                    <>
                      <img src={generations[0].generatedImage} className="w-full h-full object-cover" alt="result" />
                      <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                         <button onClick={generateProduct} disabled={isGenerating} className="pointer-events-auto p-5 bg-white/40 backdrop-blur-xl text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all border border-white/30 group/refresh">
                           <RefreshCcw className="w-6 h-6 group-hover:rotate-180 transition-transform duration-500" />
                         </button>
                      </div>
                      <button onClick={() => { setEditingGeneration(generations[0]); setActiveTab('edit'); }} className="absolute bottom-8 right-8 py-3 px-6 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-xl shadow-xl flex items-center gap-3 font-bold uppercase text-[10px] tracking-widest opacity-0 group-hover:opacity-100 hover:bg-white/20 transition-all">
                        <Palette className="w-4 h-4" /> Edit Selection
                      </button>
                    </>
                  ) : (
                    <div className="h-full w-full flex flex-col items-center justify-center relative bg-accent-subtle/50">
                      {!isGenerating && generations.length === 0 && (
                        <div className="text-center space-y-2 px-12 opacity-20 transition-opacity duration-700">
                           <Shirt className="w-8 h-8 mx-auto mb-2" />
                           <p className="font-bold uppercase tracking-[0.3em] text-[10px]">Studio Viewport</p>
                        </div>
                      )}
                      
                      {isGenerating ? (
                        <div className="flex flex-col items-center gap-6">
                          <div className="relative">
                            <div className="w-16 h-16 rounded-full border-t-2 border-brand-accent animate-spin" />
                            <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-brand-accent animate-pulse" />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-accent">Tailoring Piece</p>
                            <p className="text-[9px] text-text-muted uppercase tracking-widest opacity-50">Neural synthesis in progress</p>
                          </div>
                        </div>
                      ) : (
                        uploadedImage && generations.length === 0 && (
                          <button 
                            onClick={generateProduct}
                            className="group relative flex flex-col items-center gap-4 transition-all duration-500"
                          >
                            <div className="absolute -inset-8 bg-brand-accent/5 rounded-full blur-3xl group-hover:bg-brand-accent/10 transition-colors" />
                            <div className="relative p-10 bg-white/80 backdrop-blur-2xl text-brand-accent rounded-full shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] group-hover:shadow-[0_45px_80px_-20px_rgba(0,0,0,0.15)] group-hover:-translate-y-1 group-active:translate-y-0.5 group-active:scale-95 transition-all border border-white">
                              <Sparkles className="w-10 h-10 group-hover:scale-110 transition-transform duration-500" />
                            </div>
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-accent">Generate Piece</span>
                              <span className="text-[8px] text-text-muted uppercase tracking-[0.1em] opacity-40">Ready for studio render</span>
                            </div>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-6">
                   <div className="space-y-4">
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold uppercase text-text-muted px-1">Product Title</label>
                       <input readOnly value={generations[0]?.title || ''} className="sleek-input w-full" placeholder="Title" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold uppercase text-text-muted px-1">Description</label>
                       <textarea readOnly rows={4} value={generations[0]?.description || ''} className="sleek-input w-full resize-none" placeholder="Description" />
                     </div>
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold uppercase text-text-muted px-1">Meta Description</label>
                       <textarea readOnly rows={2} value={generations[0]?.metaDescription || ''} className="sleek-input w-full resize-none text-[11px]" placeholder="Meta Description" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold uppercase text-text-muted px-1">Color (Tag)</label>
                         <input readOnly value={generations[0]?.color || ''} className="sleek-input w-full text-[11px]" placeholder="Color" />
                       </div>
                       <div className="space-y-1">
                         <label className="text-[10px] font-bold uppercase text-text-muted px-1">Pattern (Tag)</label>
                         <input readOnly value={generations[0]?.pattern || ''} className="sleek-input w-full text-[11px]" placeholder="Pattern" />
                       </div>
                     </div>
                   </div>
                   <button onClick={() => setActiveTab('collection')} className="w-full py-4 border border-border-main rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-accent-subtle transition-all">View Collection</button>
                </div>
              </motion.div>
            ) : activeTab === 'collection' ? (
              <motion.div key="collection" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {generations.map(gen => (
                   <GenerationCard key={gen.id} gen={gen} onDelete={() => removeGeneration(gen.id)} onEdit={() => { setEditingGeneration(gen); setActiveTab('edit'); }} delay={0} />
                ))}
              </motion.div>
            ) : (
              <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full min-h-[600px] bg-bg-panel rounded-3xl overflow-hidden border border-border-main relative">
                {editingGeneration ? (
                  <>
                    <ImageEditor image={editingGeneration.generatedImage} onClose={() => setActiveTab('studio')} onApply={(mask, prompt) => handleApplyEdit(editingGeneration.generatedImage, mask, prompt)} />
                    {isGenerating && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 text-white">
                        <Loader2 className="w-10 h-10 animate-spin text-white" />
                        <p className="font-bold uppercase tracking-widest text-xs">Synthesizing Reconstruction...</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12">
                    <Palette className="w-12 h-12 text-text-muted mb-4 opacity-20" />
                    <p className="font-bold text-text-muted uppercase tracking-widest text-xs">No Active Layer. Select from Library.</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function ImageEditor({ image, onClose, onApply }: { image: string, onClose: () => void, onApply: (mask: string, prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const [logoStyle, setLogoStyle] = useState<'embroidered' | 'screen-printed'>('embroidered');
  const [logoColor, setLogoColor] = useState('white ink');
  const [logoPlacement, setLogoPlacement] = useState('right thigh/pocket and smaller logo at outside and bottom of each pant leg');
  const [logoAdjustment, setLogoAdjustment] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleApply = () => {
    if (!canvasRef.current) return;
    const temp = document.createElement('canvas');
    temp.width = canvasRef.current.width;
    temp.height = canvasRef.current.height;
    const tCtx = temp.getContext('2d')!;
    tCtx.fillStyle = 'black';
    tCtx.fillRect(0, 0, temp.width, temp.height);
    tCtx.drawImage(canvasRef.current, 0, 0);

    const fullPrompt = `LOGO RECONSTRUCTION: Replace the distorted artifact with a crisp, high-definition ${logoStyle} Zimbabalooba logo. 
GEOMETRY: The logo must be perfectly proportional and undistorted, maintaining its original vector-like clarity despite the fabric folds. 
FIDELITY LOCK: Ensure the logo sits flat on the ${logoPlacement} area, following the natural lighting and shadows of the garment. ${logoAdjustment ? `OFFSET: ${logoAdjustment}.` : ''}
TEXTURE: Match the ${logoColor} texture from the source flat lay image exactly. 
BRAND INTEGRITY: Keep the background as the off-white plastered wall and matte white concrete floor. Do not alter the model's skin texture or the 'barefoot' requirement. 
USER INSTRUCTIONS: ${prompt}`;

    onApply(temp.toDataURL('image/png'), fullPrompt);
  };

  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current && imageRef.current) {
        // Sync canvas size to the ACTUAL rendered size of the image
        const { width, height } = imageRef.current.getBoundingClientRect();
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) { 
          ctx.lineJoin = 'round'; 
          ctx.lineCap = 'round'; 
          ctx.lineWidth = width / 15; // Responsive brush size
          ctx.strokeStyle = 'white'; 
        }
      }
    };

    updateCanvasSize();
    // Use an interval to catch layout shifts after image loads
    const interval = setInterval(updateCanvasSize, 500);
    window.addEventListener('resize', updateCanvasSize);
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
      clearInterval(interval);
    };
  }, []);

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.lineTo(x, y); 
    ctx.stroke(); 
    ctx.beginPath(); 
    ctx.moveTo(x, y);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <div className="flex-1 bg-gray-900 relative flex items-center justify-center p-4 lg:p-8 min-h-[400px] lg:min-h-0">
        <div ref={containerRef} className="relative max-h-[70vh] lg:max-h-full aspect-[2/3] bg-black shadow-2xl flex items-center justify-center overflow-hidden">
           <img 
             ref={imageRef}
             src={image} 
             className="max-w-full max-h-full object-contain pointer-events-none" 
             alt="edit" 
             onLoad={() => {
                // Trigger a canvas resize when image is done loading
                const { width, height } = imageRef.current?.getBoundingClientRect() || { width: 0, height: 0 };
                if (canvasRef.current) {
                  canvasRef.current.width = width;
                  canvasRef.current.height = height;
                }
             }}
           />
           <canvas 
             ref={canvasRef} 
             onMouseDown={() => setIsDrawing(true)} 
             onMouseMove={draw} 
             onMouseUp={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }} 
             onTouchStart={(e) => { e.preventDefault(); setIsDrawing(true); }}
             onTouchMove={(e) => { e.preventDefault(); draw(e); }}
             onTouchEnd={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }}
             style={{ 
               width: imageRef.current?.clientWidth, 
               height: imageRef.current?.clientHeight,
               top: imageRef.current?.offsetTop,
               left: imageRef.current?.offsetLeft
             }}
             className="absolute opacity-50 mix-blend-screen cursor-crosshair touch-none" 
           />
        </div>
        <div className="absolute top-4 left-4 lg:top-8 lg:left-8 flex gap-2">
          <button onClick={() => canvasRef.current?.getContext('2d')?.clearRect(0,0,9999,9999)} className="py-2 px-4 bg-white/10 text-white rounded-lg text-[10px] uppercase font-bold backdrop-blur-md hover:bg-white/20 transition-all">Clear Mask</button>
          <button onClick={onClose} className="py-2 px-4 bg-white/10 text-white rounded-lg text-[10px] uppercase font-bold backdrop-blur-md hover:bg-white/20 transition-all">Discard</button>
        </div>
      </div>
      <div className="w-full lg:w-80 bg-white p-6 flex flex-col gap-6 overflow-y-auto border-t lg:border-t-0 lg:border-l border-border-main">
        <div className="section-label mb-0">Logo Reconstruction</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <div className="space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Fabric Technique</span>
            <div className="flex gap-2">
              <button 
                onClick={() => setLogoStyle('embroidered')} 
                className={cn("flex-1 py-2 text-[10px] font-bold rounded-lg border uppercase transition-all", logoStyle === 'embroidered' ? "bg-brand-primary text-white border-brand-primary" : "border-border-main text-text-muted")}
              >
                Embroidered
              </button>
              <button 
                onClick={() => setLogoStyle('screen-printed')} 
                className={cn("flex-1 py-2 text-[10px] font-bold rounded-lg border uppercase transition-all", logoStyle === 'screen-printed' ? "bg-brand-primary text-white border-brand-primary" : "border-border-main text-text-muted")}
              >
                Printed
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Placement Target</span>
            <input 
              value={logoPlacement} 
              onChange={(e) => setLogoPlacement(e.target.value)}
              className="sleek-input w-full text-xs" 
              placeholder="e.g., right pocket"
            />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Micro-Adjustment (cm)</span>
            <input 
              value={logoAdjustment} 
              onChange={(e) => setLogoAdjustment(e.target.value)}
              className="sleek-input w-full text-xs" 
              placeholder="e.g., 2cm up, 1cm left"
            />
          </div>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">Texture/Color Lock</span>
            <input 
              value={logoColor} 
              onChange={(e) => setLogoColor(e.target.value)}
              className="sleek-input w-full text-xs" 
              placeholder="e.g., gold thread / white ink"
            />
          </div>
        </div>

        <div className="divider h-px bg-border-main w-full" />

        <div className="section-label mb-0">Custom Refinements</div>
        <textarea 
          value={prompt} 
          onChange={(e) => setPrompt(e.target.value)} 
          placeholder="Add specific instructions for the AI..." 
          className="sleek-input min-h-[100px] resize-none text-xs" 
        />
        
        <div className="bg-accent-subtle p-3 rounded-xl">
          <p className="text-[10px] text-text-muted leading-relaxed">
            <span className="font-bold text-brand-primary uppercase">Brand Integrity Active</span><br/>
            Background consistency and 'barefoot' requirement locked.
          </p>
        </div>

        <button 
          onClick={handleApply} 
          className="w-full py-4 bg-brand-accent text-white rounded-xl font-bold text-xs uppercase tracking-widest shadow-lg hover:brightness-110 active:scale-95 transition-all"
        >
          Finalize Reconstruction
        </button>
      </div>
    </div>
  );
}

function GenerationCard({ gen, onDelete, onEdit, delay }: any) {
  return (
    <div className="sleek-card group overflow-hidden bg-white hover:shadow-lg transition-shadow">
       <div className="aspect-[3/4] overflow-hidden relative">
          <img src={gen.generatedImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="item" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
             <button onClick={onEdit} className="p-3 bg-white text-brand-accent rounded-full hover:bg-brand-accent hover:text-white transition-colors"><Palette className="w-5 h-5" /></button>
             <button onClick={onDelete} className="p-3 bg-white text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-colors"><Trash2 className="w-5 h-5" /></button>
          </div>
       </div>
       <div className="p-4 space-y-3">
          <div>
            <label className="text-[8px] font-bold uppercase text-text-muted block mb-0.5">Title</label>
            <h3 className="font-bold text-sm truncate uppercase tracking-tight">{gen.title}</h3>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-text-muted block mb-0.5">Description</label>
            <p className="text-[10px] text-text-muted line-clamp-2 h-8 leading-relaxed">{gen.description}</p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[8px] font-bold uppercase text-text-muted block mb-0.5">Color</label>
              <span className="text-[9px] font-medium bg-accent-subtle px-2 py-0.5 rounded uppercase">{gen.color || 'N/A'}</span>
            </div>
            <div className="flex-1">
              <label className="text-[8px] font-bold uppercase text-text-muted block mb-0.5">Pattern</label>
              <span className="text-[9px] font-medium bg-accent-subtle px-2 py-0.5 rounded uppercase">{gen.pattern || 'N/A'}</span>
            </div>
          </div>
       </div>
    </div>
  );
}

function OptionGroup({ label, options, value, onChange }: any) {
  return (
    <div className="space-y-1.5">
      <div className="section-label mb-0">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt: string) => (
          <button 
            key={opt} 
            onClick={() => onChange(opt)} 
            className={cn(
              "px-2 py-1 rounded-md border text-[9px] font-bold uppercase tracking-wider transition-all", 
              value === opt 
                ? "bg-brand-accent text-white border-brand-accent shadow-sm" 
                : "bg-white text-text-muted border-border-main hover:border-brand-accent/30"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
