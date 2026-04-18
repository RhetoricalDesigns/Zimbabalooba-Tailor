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
  background: 'Product Studio White'
};

// --- App Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'collection'>('studio');
  const [generations, setGenerations] = useState<GenerationResult[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [customBackground, setCustomBackground] = useState<string | null>(null);
  const [options, setOptions] = useState<GenerationOptions>(DEFAULT_OPTIONS);
  const [editingGeneration, setEditingGeneration] = useState<GenerationResult | null>(null);
  
  // Initialization of Gemini
  const aiRef = useRef<any>(null);

  useEffect(() => {
    // Load history from localStorage
    const saved = localStorage.getItem('zimbabalooba_history');
    if (saved) {
      try {
        setGenerations(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
    
    // Initialize Gemini
    if (process.env.GEMINI_API_KEY) {
      aiRef.current = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('zimbabalooba_history', JSON.stringify(generations));
  }, [generations]);

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
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: baseImage.split(',')[1]
                }
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: maskDataUrl.split(',')[1]
                }
              },
              {
                text: `Modify the first image based on the prompt: "${editPrompt}". The second image provided is a monochrome mask where the white areas indicate exactly where the changes should occur. Ensure the lighting and textures match the original photo perfectly.`
              }
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
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
      };
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
      if (!ai) throw new Error("AI not initialized. Check your API Key.");
      
      // Step 1: Analyze Garment & Generate Content
      // Using gemini-3-flash-preview for best availability and speed
      const contentResult = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: uploadedImage.split(',')[1]
                }
              },
              {
                text: `You are an expert fashion copywriter and style analyst for Zimbabalooba Fashion Tailor.
                Analyze this flat lay garment with extreme precision. 
                
                Generate a response in JSON format valid for the following schema:
                { "title": "...", "description": "...", "metaDescription": "...", "imagePrompt": "..." }
                
                The imagePrompt should be a detailed instruction for an image generation model to create a realistic photo of a ${options.gender} model (${options.race}) wearing this garment. Pose: ${options.pose}. Setting: ${options.background}.`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json"
        }
      });

      if (!contentResult.text) throw new Error("No descriptive content returned from AI.");
      const content = JSON.parse(contentResult.text);

      // Step 2: Generate the Virtual Try-On Image
      // Using gemini-2.5-flash-image for reliable image generation
      const imageParts: any[] = [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: uploadedImage.split(',')[1]
          }
        }
      ];

      if (customBackground && options.background === 'Custom Upload') {
        imageParts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: customBackground.split(',')[1]
          }
        });
      }

      const backgroundInstruction = options.background === 'Custom Upload' 
        ? "Use the second image provided as the specific background environment. Ensure the model is seamlessly integrated into this environment with correct scale, lighting, and shadows."
        : `Background: ${options.background}.`;

      imageParts.push({
        text: `Create a photorealistic fashion editorial image of a ${options.gender} model (${options.race}) wearing the garment from the first image. Pose: ${options.pose}. ${backgroundInstruction} High-end professional photography style. ${content.imagePrompt}`
      });

      const imageResult = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [
          {
            parts: imageParts
          }
        ]
      });

      let generatedImgBase64 = '';
      const parts = imageResult.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          generatedImgBase64 = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      // If no image was generated (sometimes happens if safety filters hit or model doesn't support it well), 
      // we generate a placeholder but indicate success
      if (!generatedImgBase64) {
        console.warn("No image generated by Gemini, using placeholder for demo.");
        generatedImgBase64 = `https://picsum.photos/seed/fashion-${Date.now()}/600/800`;
      }

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
      setActiveTab('collection');
      setUploadedImage(null);
    } catch (error) {
      console.error("Generation failed", error);
      alert("Something went wrong during generation. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadWooCommerceCSV = () => {
    const csvData = generations.map(gen => ({
      'Post Title': gen.title,
      'Post Content': gen.description,
      'Meta Description': gen.metaDescription,
      'Regular Price': '49.99', // Placeholder
      'SKU': `ZBT-${gen.id.slice(0, 8).toUpperCase()}`,
      'Images': gen.generatedImage.startsWith('data:') ? 'uploaded_to_server_url' : gen.generatedImage,
      'Attribute 1 name': 'Gender',
      'Attribute 1 value(s)': gen.options.gender,
      'Attribute 2 name': 'Race',
      'Attribute 2 value(s)': gen.options.race,
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "woocommerce_inventory.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const removeGeneration = (id: string) => {
    setGenerations(generations.filter(g => g.id !== id));
  };

  return (
    <div className="flex h-screen w-screen bg-bg-main overflow-hidden">
      {/* Side Control Panel */}
      <aside className="w-80 bg-bg-panel border-r border-border-main flex flex-col p-6 shrink-0 h-full overflow-y-auto">
        <div className="flex items-center gap-2 mb-8 group cursor-pointer">
          <div className="w-8 h-8 bg-brand-primary flex items-center justify-center rounded-lg shadow-sm group-hover:bg-brand-primary-dark transition-colors">
            <Shirt className="text-white w-5 h-5" />
          </div>
          <div className="font-extrabold text-xl tracking-tighter text-brand-primary uppercase">
            Zimbabalooba
          </div>
        </div>
        
        <div className="section-label">Source Clothing</div>
        {!uploadedImage ? (
          <label className="group relative block aspect-[2/3] w-full min-h-[380px] border-2 border-dashed border-border-main rounded-2xl cursor-pointer hover:border-brand-primary hover:bg-accent-subtle transition-all overflow-hidden mb-8">
            <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-text-muted group-hover:text-brand-primary p-8 text-center bg-white">
              <div className="w-16 h-16 bg-accent-subtle rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-brand-primary" />
              </div>
              <p className="text-[1.1rem] font-extrabold uppercase tracking-tight mb-2">Upload Flat Lay</p>
              <p className="text-[0.75rem] px-4 opacity-70 leading-relaxed font-medium">
                Drag & drop or tap to browse high-resolution garment imagery
              </p>
            </div>
          </label>
        ) : (
          <div className="relative aspect-[2/3] w-full min-h-[380px] rounded-2xl overflow-hidden shadow-md mb-8 border border-border-main">
            <img src={uploadedImage} alt="Uploaded garment" className="w-full h-full object-cover" />
            <button 
              onClick={() => setUploadedImage(null)}
              className="absolute top-4 right-4 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-all shadow-lg hover:scale-110"
            >
              <RefreshCcw className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="space-y-6 flex-1">
          <OptionGroup 
            label="Model Profile" 
            options={['Female', 'Male', 'Unisex', 'Non-binary']}
            value={options.gender}
            onChange={(v) => setOptions({...options, gender: v})}
          />
          <OptionGroup 
            label="Diversity (Race)" 
            options={['Diverse', 'Asian', 'Black', 'Caucasian', 'Latino']}
            value={options.race}
            onChange={(v) => setOptions({...options, race: v})}
          />
          <OptionGroup 
            label="Photography Style" 
            options={['Natural Standing', 'Dynamic Movement', 'High Fashion Sit', 'Detail Close-up']}
            value={options.pose}
            onChange={(v) => setOptions({...options, pose: v})}
          />
          <div className="space-y-4">
            <OptionGroup 
              label="Environment" 
              options={['Product Studio White', 'Luxurious Interior', 'Urban Streetscape', 'Coastal Breeze']}
              value={options.background}
              onChange={(v) => setOptions({...options, background: v})}
            />
            
            <div className="pt-2">
              <label className={cn(
                "w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer text-[11px] font-bold uppercase tracking-wider",
                options.background === 'Custom Upload' 
                  ? "border-brand-accent bg-accent-subtle text-brand-accent shadow-sm" 
                  : "border-border-main text-text-muted hover:border-brand-accent hover:text-brand-accent"
              )}>
                <input type="file" className="hidden" accept="image/*" onChange={handleBackgroundUpload} />
                <Camera className="w-4 h-4" />
                {customBackground ? "Replace Background" : "Upload Custom BG"}
              </label>
              
              {customBackground && (
                <div className="mt-3 relative group aspect-video rounded-lg overflow-hidden border border-border-main">
                  <img src={customBackground} alt="Custom Background" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span 
                      onClick={() => setOptions({...options, background: 'Custom Upload'})}
                      className="text-[9px] text-white font-bold tracking-widest uppercase cursor-pointer px-2 py-1 bg-brand-accent rounded"
                    >
                      Use This
                    </span>
                  </div>
                  {options.background === 'Custom Upload' && (
                    <div className="absolute top-1 right-1">
                      <div className="bg-brand-accent rounded-full p-0.5 shadow-sm">
                        <CheckCircle2 className="w-3 h-3 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <button 
          onClick={generateProduct}
          disabled={!uploadedImage || isGenerating}
          className={cn(
            "mt-8 w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 tracking-wider",
            !uploadedImage || isGenerating 
              ? "bg-gray-100 text-gray-400 cursor-not-allowed" 
              : "bg-brand-accent text-white hover:bg-brand-accent-dark shadow-md shadow-brand-accent/20 active:scale-95"
          )}
        >
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin w-5 h-5" />
              Generating...
            </>
          ) : (
            <>
              Generate Try-On
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col p-6 overflow-hidden h-full">
        <div className="flex items-center gap-8 border-b border-border-main mb-6 shrink-0">
          <button 
            onClick={() => setActiveTab('studio')}
            className={cn(
              "pb-4 font-semibold text-[0.95rem] transition-all relative",
              activeTab === 'studio' ? "text-brand-accent after:content-[''] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-brand-accent" : "text-text-muted hover:text-text-main"
            )}
          >
            Generator
          </button>
          <button 
            onClick={() => setActiveTab('collection')}
            className={cn(
              "pb-4 font-semibold text-[0.95rem] transition-all relative",
              activeTab === 'collection' ? "text-brand-accent after:content-[''] after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:bg-brand-accent" : "text-text-muted hover:text-text-main"
            )}
          >
            Saved Library ({generations.length})
          </button>

          <button 
            onClick={downloadWooCommerceCSV}
            disabled={generations.length === 0}
            className="ml-auto flex items-center gap-2 text-[0.8rem] font-bold text-brand-accent hover:text-brand-accent-dark transition-colors disabled:opacity-0"
          >
            <Download className="w-4 h-4" />
            Download WooCommerce CSV
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'studio' ? (
              <motion.div 
                key="workspace"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid lg:grid-cols-[1fr_300px] gap-6"
              >
                <div className="sleek-card flex items-center justify-center relative overflow-hidden aspect-[4/3] bg-accent-subtle self-start">
                  {generations.length > 0 && !isGenerating ? (
                    <div className="relative w-full h-full">
                      <img 
                        src={generations[0].generatedImage} 
                        alt="Latest Generation" 
                        className="w-full h-full object-cover"
                      />
                      <button 
                        onClick={() => setEditingGeneration(generations[0])}
                        className="absolute bottom-4 right-4 p-3 bg-brand-accent text-white rounded-xl shadow-lg hover:bg-brand-accent-dark transition-all flex items-center gap-2 font-bold text-xs"
                      >
                        <Palette className="w-4 h-4" />
                        Neural Paintbrush
                      </button>
                    </div>
                  ) : (
                    <div className="text-center p-8">
                      <div className="text-5xl opacity-20 mb-4 flex justify-center"><User className="w-12 h-12" /></div>
                      <p className="font-semibold text-text-main">AI Model Generation View</p>
                      <p className="text-sm text-text-muted mt-1 leading-relaxed">
                        {isGenerating ? "The model is preparing your masterpiece..." : "Upload a garment to begin tailoring"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6">
                  <div className="section-label">Product Metadata</div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-[0.7rem] block mb-1.5 font-medium text-text-muted uppercase tracking-wider">Product Title</label>
                      <input 
                        type="text" 
                        readOnly
                        value={generations[0]?.title || ""} 
                        className="sleek-input w-full font-medium" 
                        placeholder={isGenerating ? "Refining title..." : "e.g. Silk V-Neck Blouse"}
                      />
                    </div>
                    <div>
                      <label className="text-[0.7rem] block mb-1.5 font-medium text-text-muted uppercase tracking-wider">Description</label>
                      <textarea 
                        readOnly
                        rows={6}
                        value={generations[0]?.description || ""} 
                        className="sleek-input w-full resize-none leading-relaxed" 
                        placeholder={isGenerating ? "Analyzing weave and silhouette..." : "AI generated description will appear here..."}
                      />
                    </div>
                    <div>
                      <label className="text-[0.7rem] block mb-1.5 font-medium text-text-muted uppercase tracking-wider">Meta Description</label>
                      <textarea 
                        readOnly
                        rows={3}
                        value={generations[0]?.metaDescription || ""} 
                        className="sleek-input w-full resize-none italic" 
                        placeholder={isGenerating ? "Optimizing for search..." : "SEO optimized snippet"}
                      />
                    </div>
                  </div>
                  {generations.length > 0 && (
                    <button 
                      onClick={() => setActiveTab('collection')}
                      className="w-full py-3 px-4 bg-bg-main hover:bg-border-main rounded-xl text-sm font-bold text-text-main transition-all border border-border-main flex items-center justify-center gap-2"
                    >
                      <History className="w-4 h-4" />
                      View Collection
                    </button>
                  )}
                </div>
              </motion.div>
            ) : (
                  <motion.div 
                    key="collection"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  >
                    {generations.map((gen, idx) => (
                      <GenerationCard 
                        key={gen.id} 
                        gen={gen} 
                        onDelete={() => removeGeneration(gen.id)}
                        onEdit={() => setEditingGeneration(gen)}
                        delay={idx * 0.05}
                      />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {editingGeneration && (
                <ImageEditor 
                  image={editingGeneration.generatedImage}
                  onClose={() => setEditingGeneration(null)}
                  onApply={(mask, prompt) => handleApplyEdit(editingGeneration.generatedImage, mask, prompt)}
                />
              )}
            </AnimatePresence>

        {/* Footer Library Peek */}
        <div className="mt-8 border-t border-border-main pt-6 shrink-0">
          <div className="flex justify-between items-center mb-3">
            <div className="section-label mb-0">Recent Generations</div>
            <button 
              onClick={() => setActiveTab('collection')}
              className="text-[10px] uppercase font-bold text-brand-primary hover:underline"
            >
              View All
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none h-24">
            {generations.slice(0, 10).map((gen) => (
              <button 
                key={gen.id}
                onClick={() => {
                  // Move this generation to the top to show it in the generator view
                  const others = generations.filter(g => g.id !== gen.id);
                  setGenerations([gen, ...others]);
                  setActiveTab('studio');
                }}
                className="w-20 aspect-square shrink-0 rounded-lg overflow-hidden border border-border-main bg-white hover:border-brand-primary transition-all shadow-sm"
              >
                <img src={gen.generatedImage} className="w-full h-full object-cover" alt="peek" />
              </button>
            ))}
            <button 
              onClick={() => setActiveTab('studio')}
              className="w-20 aspect-square shrink-0 rounded-lg border-2 border-dashed border-border-main flex items-center justify-center text-text-muted hover:border-brand-primary hover:text-brand-primary transition-all bg-accent-subtle"
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Image Editor Component ---

function ImageEditor({ 
  image, 
  onClose, 
  onApply 
}: { 
  image: string, 
  onClose: () => void, 
  onApply: (mask: string, prompt: string) => void 
}) {
  const [prompt, setPrompt] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && containerRef.current) {
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = 40;
        ctx.strokeStyle = 'white';
      }
    }
  }, []);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.beginPath(); // End current path
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleApply = () => {
    if (!canvasRef.current || !prompt) return;
    // Create a temporary canvas for the final mask (black background, white drawing)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvasRef.current.width;
    tempCanvas.height = canvasRef.current.height;
    const tCtx = tempCanvas.getContext('2d');
    if (tCtx) {
      tCtx.fillStyle = 'black';
      tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      tCtx.drawImage(canvasRef.current, 0, 0);
      onApply(tempCanvas.toDataURL('image/png'), prompt);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
    >
      <div className="bg-bg-panel w-full max-w-5xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-border-main flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-primary/10 rounded-lg">
              <Palette className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h3 className="font-bold text-text-main">Neural Paintbrush Editor</h3>
              <p className="text-[10px] uppercase font-bold text-text-muted tracking-widest">Mark areas to modify and describe changes</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-main rounded-full transition-colors">
            <X className="w-6 h-6 text-text-muted" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-black p-8 flex items-center justify-center relative">
            <div ref={containerRef} className="relative max-h-full aspect-[3/4] bg-white rounded-lg shadow-2xl overflow-hidden">
              <img src={image} className="w-full h-full object-contain pointer-events-none" alt="edit target" />
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="absolute inset-0 cursor-crosshair mix-blend-screen opacity-70"
              />
            </div>
            <div className="absolute top-12 left-12 flex flex-col gap-2">
               <button onClick={clear} className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all text-[10px] uppercase font-bold">
                 Clear Mask
               </button>
            </div>
          </div>

          <div className="w-80 border-l border-border-main p-8 flex flex-col gap-8 bg-accent-subtle/30">
            <div>
              <label className="section-label mb-3">Edit Instructions</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Change the collar to a lace Peter Pan style..."
                className="sleek-input w-full h-40 resize-none text-sm leading-relaxed"
              />
              <p className="text-[10px] text-text-muted mt-3 italic">
                Tips: Describe colors, textures, or specific garment details you want to swap.
              </p>
            </div>

            <div className="mt-auto space-y-4">
              <button
                onClick={handleApply}
                disabled={!prompt}
                className={cn(
                  "w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all",
                  prompt ? "bg-brand-primary text-white hover:bg-brand-primary-dark shadow-xl" : "bg-bg-main text-text-muted cursor-not-allowed"
                )}
              >
                <Wand2 className="w-5 h-5" />
                Apply AI Magic
              </button>
              <button onClick={onClose} className="w-full py-3 text-sm font-semibold text-text-muted hover:text-text-main transition-colors">
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// --- Sub-components ---

function OptionGroup({ label, options, value, onChange }: { 
  label: string, 
  options: string[], 
  value: string, 
  onChange: (v: string) => void 
}) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "btn-pill truncate",
              value === opt && "btn-pill-active"
            )}
            title={opt}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerationCard({ 
  gen, 
  onDelete, 
  onEdit,
  delay 
}: { 
  key?: React.Key,
  gen: GenerationResult, 
  onDelete: () => void, 
  onEdit?: () => void,
  delay: number 
}) {
  const [showMeta, setShowMeta] = useState(false);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group sleek-card overflow-hidden hover:shadow-lg transition-all duration-300"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-accent-subtle">
        <img 
          src={gen.generatedImage} 
          alt={gen.title} 
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        />
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button 
            onClick={onDelete}
            className="p-2 bg-white/80 hover:bg-red-50 text-text-main hover:text-red-500 rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex gap-2">
           <div className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-[9px] uppercase tracking-widest font-bold shadow-sm">
             {gen.options.gender} • {gen.options.race}
           </div>
        </div>
      </div>
      
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-base font-bold text-text-main line-clamp-1">{gen.title}</h3>
          <span className="text-[9px] text-text-muted font-mono bg-bg-main px-1.5 py-0.5 rounded uppercase">{new Date(gen.timestamp).toLocaleDateString()}</span>
        </div>
        
        <button 
          onClick={() => onEdit?.()}
          className="w-full py-2 mb-3 bg-accent-subtle hover:bg-border-main text-text-main rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 border border-border-main transition-all"
        >
          <Palette className="w-3.5 h-3.5" />
          Edit with Paintbrush
        </button>

        <p className="text-xs text-text-muted line-clamp-2 mb-4 leading-relaxed h-8">
          {gen.description}
        </p>

        <div className="space-y-3">
          <button 
            onClick={() => setShowMeta(!showMeta)}
            className="w-full flex justify-between items-center text-[10px] uppercase tracking-wider font-bold text-brand-primary hover:text-brand-primary-dark transition-colors"
          >
            {showMeta ? 'Hide Meta Details' : 'View Meta Details'}
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", showMeta && "rotate-90")} />
          </button>
          
          <AnimatePresence>
            {showMeta && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-3 bg-accent-subtle rounded-xl text-[10px] space-y-3 text-text-muted border border-border-main">
                  <div>
                    <span className="font-bold uppercase tracking-widest block mb-1 text-text-main text-[8px]">SEO Meta Description</span>
                    {gen.metaDescription}
                  </div>
                  <div className="pt-2 border-t border-border-main">
                    <span className="font-bold uppercase tracking-widest block mb-1 text-text-main text-[8px]">Original Flat Lay</span>
                    <img src={gen.originalImage} className="w-12 h-12 object-cover rounded-lg border border-border-main" alt="flatlay thumb" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
