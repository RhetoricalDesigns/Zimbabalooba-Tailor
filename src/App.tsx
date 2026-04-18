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
  Wand2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import Papa from 'papaparse';
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
  
  const aiRef = useRef<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('zimbabalooba_history');
    if (saved) {
      try {
        setGenerations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    
    if (process.env.GEMINI_API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('zimbabalooba_history', JSON.stringify(generations));
  }, [generations]);

  const removeGeneration = (id: string) => {
    setGenerations(prev => prev.filter(g => g.id !== id));
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
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "image/jpeg", data: baseImage.split(',')[1] } },
              { inlineData: { mimeType: "image/png", data: maskDataUrl.split(',')[1] } },
              { text: `Modify the first image based on the prompt: "${editPrompt}". The second image provided is a monochrome mask where the white areas indicate exactly where the changes should occur. Ensure the lighting and textures match the original photo perfectly.` }
            ]
          }
        ]
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
              { text: "You are an expert fashion copywriter and style analyst for Zimbabalooba Fashion Tailor. Analyze this flat lay garment with extreme precision. Generate a response in JSON format: { \"title\": \"...\", \"description\": \"...\", \"metaDescription\": \"...\", \"imagePrompt\": \"...\" }. IMPORTANT: Shirts MUST be tucked in. Models MUST be barefoot." }
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
          ? "Setting: A Zimbabalooba brand studio. Model very close to wall. Textured off-white plastered wall. Matte white concrete floor. Seaside worn wood shuttered door. Diffused sunlight."
          : `Background: ${options.background}`;

      const poseInstruction = options.pose === 'Natural Standing' 
        ? "Relaxed and comfortable natural standing pose, leaning slightly with a soft expression"
        : options.pose;

      imageParts.push({
        text: `Create a photorealistic fashion editorial of a ${options.gender} model (${options.race}) wearing the garment from the first image. Pose: ${poseInstruction}. ${backgroundInstruction}. Brand Invariants: Shirts tucked in, barefoot models. ${content.imagePrompt}`
      });

      const imageResult = await ai.models.generateContent({ model: "gemini-2.5-flash-image", contents: [{ parts: imageParts }] });
      
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
      'Tags': `${gen.options.race}, ${gen.options.pose}`,
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
    <div className="flex h-screen w-screen bg-bg-main overflow-hidden">
      <aside className="w-80 bg-bg-panel border-r border-border-main flex flex-col p-6 shrink-0 h-full overflow-y-auto">
        <div className="flex items-center gap-2 mb-8">
          <Shirt className="text-brand-primary w-8 h-8" />
          <h1 className="text-xl font-black tracking-tighter text-brand-primary">ZIMBABALOOBA</h1>
        </div>

        {!uploadedImage ? (
          <label className="group flex flex-col items-center justify-center aspect-[2/3] border-2 border-dashed border-border-main rounded-2xl cursor-pointer hover:bg-accent-subtle transition-all mb-8 bg-white">
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <Upload className="w-10 h-10 text-brand-primary mb-4" />
            <span className="font-bold uppercase text-xs">Upload Flat Lay</span>
          </label>
        ) : (
          <div className="relative aspect-[2/3] rounded-2xl overflow-hidden mb-8 border border-border-main shadow-md">
            <img src={uploadedImage} className="w-full h-full object-cover" alt="source" />
            <button onClick={() => setUploadedImage(null)} className="absolute top-4 right-4 p-2 bg-black/60 text-white rounded-full hover:bg-black/80"><RefreshCcw className="w-5 h-5" /></button>
          </div>
        )}

        <div className="space-y-6">
          <OptionGroup label="Model" options={['Female', 'Male', 'Non-binary']} value={options.gender} onChange={(v: string) => setOptions({...options, gender: v})} />
          <OptionGroup label="Photography" options={['Natural Standing', 'Both Hands in Pockets', 'Walking', 'One Hand in Pocket 45°']} value={options.pose} onChange={(v: string) => setOptions({...options, pose: v})} />
          <div className="space-y-4">
            <OptionGroup label="Environment" options={['Zimbabalooba Studio', 'Luxurious Interior', 'Urban Streetscape']} value={options.background} onChange={(v: string) => setOptions({...options, background: v})} />
            <label className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-border-main cursor-pointer text-[10px] font-bold uppercase hover:bg-accent-subtle transition-all">
              <input type="file" className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
              <Camera className="w-4 h-4" />
              Custom Background
            </label>
          </div>
        </div>

        <button 
          onClick={generateProduct} 
          disabled={!uploadedImage || isGenerating}
          className={cn("mt-8 w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all", !uploadedImage || isGenerating ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-brand-accent text-white shadow-lg active:scale-95")}
        >
          {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : "Generate Try-On"}
        </button>
      </aside>

      <main className="flex-1 flex flex-col p-6 overflow-hidden">
        <div className="flex items-center gap-8 border-b border-border-main mb-6 shrink-0">
          {(['studio', 'collection', 'edit'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={cn("pb-4 font-bold uppercase text-xs tracking-widest relative transition-all", activeTab === tab ? "text-brand-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-accent" : "text-text-muted")}>
              {tab === 'edit' ? 'Edit Image' : tab}
            </button>
          ))}
          <button onClick={downloadWooCommerceCSV} disabled={generations.length === 0} className="ml-auto flex items-center gap-2 text-[10px] font-bold text-brand-accent hover:underline uppercase tracking-widest">
            <Download className="w-4 h-4" /> CSV for WooCommerce
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'studio' ? (
              <motion.div key="studio" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid lg:grid-cols-[1fr_300px] gap-6 h-full">
                <div className="aspect-[4/5] bg-accent-subtle rounded-3xl overflow-hidden shadow-sm relative group">
                  {generations.length > 0 && !isGenerating ? (
                    <>
                      <img src={generations[0].generatedImage} className="w-full h-full object-cover" alt="result" />
                      <button onClick={() => { setEditingGeneration(generations[0]); setActiveTab('edit'); }} className="absolute bottom-8 right-8 p-4 bg-brand-accent text-white rounded-2xl shadow-xl flex items-center gap-2 font-bold opacity-0 group-hover:opacity-100 transition-all">
                        <Palette className="w-5 h-5" /> Edit Image
                      </button>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30">
                      <User className="w-12 h-12 mb-4" />
                      <p className="font-bold">Workspace Preview</p>
                    </div>
                  )}
                </div>
                <div className="space-y-6">
                   <div className="section-label">Metadata</div>
                   <input readOnly value={generations[0]?.title || ''} className="sleek-input w-full" placeholder="Title" />
                   <textarea readOnly rows={6} value={generations[0]?.description || ''} className="sleek-input w-full resize-none" placeholder="Description" />
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
              <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full min-h-[600px] bg-bg-panel rounded-3xl overflow-hidden border border-border-main">
                {editingGeneration ? (
                  <ImageEditor image={editingGeneration.generatedImage} onClose={() => setActiveTab('studio')} onApply={(mask, prompt) => handleApplyEdit(editingGeneration.generatedImage, mask, prompt)} />
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
  const [logoPlacement, setLogoPlacement] = useState('right thigh');
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
FIDELITY LOCK: Ensure the logo sits flat on the ${logoPlacement} area, following the natural lighting and shadows of the garment. 
TEXTURE: Match the ${logoColor} texture from the source flat lay image exactly. 
BRAND INTEGRITY: Keep the background as the off-white plastered wall and matte white concrete floor. Do not alter the model's skin texture or the 'barefoot' requirement. 
USER INSTRUCTIONS: ${prompt}`;

    onApply(temp.toDataURL('image/png'), fullPrompt);
  };

  useEffect(() => {
    if (canvasRef.current && containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvasRef.current.width = width;
      canvasRef.current.height = height;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 40; ctx.strokeStyle = 'white'; }
    }
  }, []);

  const draw = (e: any) => {
    if (!isDrawing || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d')!;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    const y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    ctx.lineTo(x, y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, y);
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 bg-gray-900 relative flex items-center justify-center p-8">
        <div ref={containerRef} className="relative h-full aspect-[2/3] bg-black shadow-2xl overflow-hidden">
           <img src={image} className="w-full h-full object-contain" alt="edit" />
           <canvas 
             ref={canvasRef} 
             onMouseDown={() => setIsDrawing(true)} 
             onMouseMove={draw} 
             onMouseUp={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }} 
             onTouchStart={() => setIsDrawing(true)}
             onTouchMove={draw}
             onTouchEnd={() => { setIsDrawing(false); canvasRef.current?.getContext('2d')?.beginPath(); }}
             className="absolute inset-0 opacity-50 mix-blend-screen cursor-crosshair" 
           />
        </div>
        <button onClick={() => canvasRef.current?.getContext('2d')?.clearRect(0,0,9999,9999)} className="absolute top-8 left-8 py-2 px-4 bg-white/10 text-white rounded-lg text-[10px] uppercase font-bold backdrop-blur-md">Clear Mask</button>
      </div>
      <div className="w-80 bg-white p-6 flex flex-col gap-6 overflow-y-auto border-l border-border-main">
        <div className="section-label mb-0">Logo Reconstruction</div>
        <div className="space-y-4">
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
              placeholder="e.g., right thigh/pocket"
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
          className="sleek-input flex-1 min-h-[100px] resize-none text-xs" 
        />
        
        <div className="bg-accent-subtle p-3 rounded-xl">
          <p className="text-[10px] text-text-muted leading-relaxed">
            <span className="font-bold text-brand-primary">BRAND INTEGRITY ACTIVE</span><br/>
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
       <div className="p-4">
          <h3 className="font-bold text-sm truncate uppercase tracking-tight">{gen.title}</h3>
          <p className="text-[10px] text-text-muted line-clamp-2 h-8 mt-1 leading-relaxed">{gen.description}</p>
       </div>
    </div>
  );
}

function OptionGroup({ label, options, value, onChange }: any) {
  return (
    <div className="space-y-2">
      <div className="section-label mb-0">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt: string) => (
          <button key={opt} onClick={() => onChange(opt)} className={cn("px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all", value === opt ? "bg-brand-primary text-white border-brand-primary shadow-sm" : "bg-white text-text-muted border-border-main hover:border-brand-primary/50")}>{opt}</button>
        ))}
      </div>
    </div>
  );
}
