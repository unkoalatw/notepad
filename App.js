// 從全域變數解構需要的 React Hooks
const { useState, useEffect, useMemo, useRef } = React;

// 從全域變數解構 Lucide 圖示
const { 
  ChevronLeft, Search, SquarePen, Trash2, Share, 
  MoreHorizontal, Calendar, Folder, PanelLeft, Plus, 
  X, Link, Image: ImageIcon, Copy, Mail, Pin, 
  CheckCircle2, Table: TableIcon, Type, ChevronRight, 
  PanelLeftClose, Sparkles, Loader2, ListChecks 
} = lucide;

const APP_STORAGE_KEY = 'ios_notes_data_pro_v3_ai';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent';

const formatNoteDate = (date) => {
  const now = new Date();
  const noteDate = new Date(date);
  const diffDays = Math.floor((now - noteDate) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return noteDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][noteDate.getDay()];
  return noteDate.toLocaleDateString();
};

const App = () => {
  // --- 狀態管理 ---
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState(['所有 iCloud', '個人', '工作', '靈感']);
  const [activeFolder, setActiveFolder] = useState('所有 iCloud');
  const [selectedNoteId, setSelectedNoteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);

  const textareaRef = useRef(null);

  // --- Gemini API 調用 ---
  const callGemini = async (prompt, systemInstruction) => {
    const apiKey = ""; // 執行環境會自動注入或手動填入
    const maxRetries = 5;
    
    const executeRequest = async (attempt) => {
      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });

      if (!response.ok) throw new Error('Gemini API Error');
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    };

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await executeRequest(i);
      } catch (err) {
        if (i === maxRetries - 1) throw err;
        await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
      }
    }
  };

  const handleAiAction = async (actionType) => {
    if (!currentNote || !currentNote.content.trim()) return;
    setIsAiLoading(true);
    setShowAiMenu(false);

    let systemPrompt = "";
    let userPrompt = currentNote.content;

    switch (actionType) {
      case 'summary':
        systemPrompt = "你是一個專業的筆記秘書。請為這段備忘錄提供精簡的繁體中文摘要，使用條列式。";
        break;
      case 'continue':
        systemPrompt = "你是一個創意寫作助手。請根據現有內容的語氣續寫約 150 字，直接輸出續寫內容。";
        break;
      case 'optimize':
        systemPrompt = "你是一個文字編輯。請修正語法並提升優雅度，保持原本意思，直接輸出優化後的全文。";
        break;
      case 'checklist':
        systemPrompt = "你是一個任務提取專家。請將內容中的行動項目轉換為 '- [ ] 任務名稱' 的格式。僅輸出清單。";
        break;
      default:
        return;
    }

    try {
      const result = await callGemini(userPrompt, systemPrompt);
      if (result) {
        let newContent = currentNote.content;
        if (actionType === 'continue') newContent += "\n\n" + result;
        else if (actionType === 'optimize') newContent = result;
        else newContent += `\n\n--- ✨ AI ${actionType === 'summary' ? '摘要' : '待辦清單'} ---\n` + result;

        const title = newContent.split('\n')[0] || '無標題';
        setNotes(prev => prev.map(n => 
          n.id === selectedNoteId ? { ...n, title, content: newContent, updatedAt: new Date().toISOString() } : n
        ));
      }
    } catch (error) {
      console.error("AI Error:", error);
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- 資料持久化 ---
  useEffect(() => {
    const saved = localStorage.getItem(APP_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setNotes(parsed.notes || []);
      setFolders(parsed.folders || []);
    } else {
      setNotes([{
        id: '1',
        title: 'Gemini AI 備忘錄助手',
        content: 'Gemini AI 備忘錄助手\n\n點擊下方的 ✨ 按鈕來體驗：\n1. 自動摘要長文\n2. 智慧續寫靈感\n3. 提取待辦清單',
        updatedAt: new Date().toISOString(),
        folder: '所有 iCloud',
        pinned: true
      }]);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ notes, folders }));
  }, [notes, folders, isLoaded]);

  // --- 計算屬性 ---
  const currentNote = useMemo(() => notes.find(n => n.id === selectedNoteId), [notes, selectedNoteId]);
  const filteredNotes = useMemo(() => {
    return notes
      .filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             n.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFolder = activeFolder === '所有 iCloud' || n.folder === activeFolder;
        return matchesSearch && matchesFolder;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? -1 : 1;
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
  }, [notes, searchQuery, activeFolder]);

  // --- 編輯功能 ---
  const handleCreateNote = () => {
    const newNote = {
      id: Date.now().toString(),
      title: '新備忘錄',
      content: '',
      updatedAt: new Date().toISOString(),
      folder: activeFolder === '所有 iCloud' ? '個人' : activeFolder,
      pinned: false
    };
    setNotes([newNote, ...notes]);
    setSelectedNoteId(newNote.id);
  };

  const insertText = (text) => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd } = textareaRef.current;
    const content = currentNote.content;
    const newContent = content.substring(0, selectionStart) + text + content.substring(selectionEnd);
    setNotes(prev => prev.map(n => n.id === selectedNoteId ? { ...n, content: newContent, updatedAt: new Date().toISOString() } : n));
    setTimeout(() => {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(selectionStart + text.length, selectionStart + text.length);
    }, 0);
  };

  return (
    <div className="flex h-screen w-full bg-[#F2F2F7] text-black font-sans overflow-hidden select-none">
      
      {/* 側邊欄 */}
      <div className={`flex flex-col border-r border-gray-300 bg-[#E5E5EA]/80 backdrop-blur-xl transition-all duration-300 ${showSidebar ? 'w-72' : 'w-0 opacity-0 overflow-hidden'}`}>
        <div className="p-6 mt-6 flex justify-between items-center min-w-[280px]">
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSidebar(false)} className="text-[#FF9500] p-1.5 hover:bg-gray-200 rounded-lg"><PanelLeftClose size={22} /></button>
            <h2 className="text-2xl font-bold text-[#FF9500]">文件夾</h2>
          </div>
          <SquarePen size={22} className="text-[#FF9500] cursor-pointer" onClick={handleCreateNote} />
        </div>
        <div className="flex-1 px-3 space-y-1 min-w-[280px]">
          {folders.map(f => (
            <div key={f} onClick={() => setActiveFolder(f)} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer ${activeFolder === f ? 'bg-[#FF9500] text-white' : 'hover:bg-gray-200 text-gray-700'}`}>
              <Folder size={18} className={activeFolder === f ? 'text-white' : 'text-[#FF9500]'} />
              <span className="font-semibold flex-1">{f}</span>
              <span className="text-xs opacity-60">{notes.filter(n => f === '所有 iCloud' || n.folder === f).length}</span>
            </div>
          ))}
          {!isAddingFolder ? (
            <button onClick={() => setIsAddingFolder(true)} className="flex items-center gap-2 p-3 text-[#FF9500] font-bold w-full hover:bg-gray-200 rounded-xl mt-4"><Plus size={20} />新增文件夾</button>
          ) : (
            <div className="p-2"><input autoFocus className="w-full p-2 rounded-lg outline-none border border-[#FF9500]/50" onBlur={() => setIsAddingFolder(false)} onKeyDown={e => e.key === 'Enter' && (setFolders([...folders, e.target.value]), setIsAddingFolder(false))} placeholder="名稱..." /></div>
          )}
        </div>
      </div>

      {/* 列表欄 */}
      <div className={`${selectedNoteId && 'hidden md:flex'} flex flex-col w-full md:w-80 border-r border-gray-300 bg-white`}>
        <div className="p-4 pt-10">
          <div className="flex items-center gap-3 mb-4">
            {!showSidebar && <button onClick={() => setShowSidebar(true)} className="text-[#FF9500]"><PanelLeft size={24} /></button>}
            <h1 className="text-3xl font-bold">備忘錄</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input className="w-full bg-[#E3E3E8]/60 rounded-xl py-2 pl-10 pr-4 outline-none" placeholder="搜尋" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1">
          {filteredNotes.map(n => (
            <div key={n.id} onClick={() => setSelectedNoteId(n.id)} className={`p-4 rounded-2xl cursor-pointer relative group ${selectedNoteId === n.id ? 'bg-[#FF9500] text-white shadow-lg' : 'hover:bg-gray-100'}`}>
              <div className="font-bold truncate text-base">{n.title || '新備忘錄'}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs ${selectedNoteId === n.id ? 'text-white/80' : 'text-gray-500'}`}>{formatNoteDate(n.updatedAt)}</span>
                <span className={`text-xs truncate ${selectedNoteId === n.id ? 'text-white/60' : 'text-gray-400'}`}>{n.content.split('\n')[1] || '尚未輸入內容'}</span>
              </div>
              {n.pinned && <Pin size={12} className="absolute top-4 right-3" />}
            </div>
          ))}
        </div>
      </div>

      {/* 編輯欄 */}
      <div className={`${!selectedNoteId && 'hidden md:flex'} flex flex-col flex-1 bg-white relative`}>
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/90 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button className="hidden md:block text-[#FF9500]" onClick={() => setShowSidebar(!showSidebar)}><PanelLeft size={24} /></button>
            <button className="md:hidden text-[#FF9500] flex items-center gap-1" onClick={() => setSelectedNoteId(null)}><ChevronLeft size={28} /><span className="font-bold">備忘錄</span></button>
          </div>
          <div className="flex items-center gap-5">
            <Share size={22} className="text-[#FF9500] cursor-pointer" onClick={() => setShowShareModal(true)} />
            <Pin size={22} className={`cursor-pointer ${currentNote?.pinned ? 'fill-[#FF9500] text-[#FF9500]' : 'text-[#FF9500]'}`} onClick={() => setNotes(notes.map(n => n.id === selectedNoteId ? {...n, pinned: !n.pinned} : n))} />
            <Trash2 size={22} className="text-[#FF9500] cursor-pointer" onClick={() => (setNotes(notes.filter(n => n.id !== selectedNoteId)), setSelectedNoteId(null))} />
            <SquarePen size={22} className="text-[#FF9500] cursor-pointer" onClick={handleCreateNote} />
          </div>
        </div>

        {currentNote ? (
          <div className="flex-1 flex flex-col bg-[#FCFCFD]">
            <div className="text-center py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">
              {new Date(currentNote.updatedAt).toLocaleString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
            
            {isAiLoading && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#FF9500] text-white px-5 py-2.5 rounded-full flex items-center gap-3 shadow-2xl z-50 animate-pulse">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm font-bold tracking-wide">✨ Gemini 正在分析...</span>
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="flex-1 w-full px-8 md:px-20 pb-40 resize-none bg-transparent outline-none text-xl leading-relaxed text-gray-800"
              value={currentNote.content}
              onChange={e => {
                const content = e.target.value;
                setNotes(notes.map(n => n.id === selectedNoteId ? {...n, title: content.split('\n')[0] || '無標題', content, updatedAt: new Date().toISOString()} : n));
              }}
              placeholder="從這裡開始寫下你的想法..."
              spellCheck="false"
            />

            {/* AI 選單 */}
            {showAiMenu && (
              <div className="absolute bottom-28 left-1/2 -translate-x-1/2 w-56 bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in slide-in-from-bottom-2">
                {[
                  { id: 'summary', icon: <Sparkles size={16} />, label: '智能摘要' },
                  { id: 'continue', icon: <SquarePen size={16} />, label: '繼續續寫' },
                  { id: 'optimize', icon: <Type size={16} />, label: '文字優化' },
                  { id: 'checklist', icon: <ListChecks size={16} />, label: '提取待辦' }
                ].map(item => (
                  <button key={item.id} onClick={() => handleAiAction(item.id)} className="w-full px-5 py-4 text-left text-sm font-bold flex items-center gap-3 hover:bg-orange-50 text-gray-700 transition-colors border-b border-gray-50 last:border-0">
                    <span className="text-[#FF9500]">{item.icon}</span> {item.label}
                  </button>
                ))}
              </div>
            )}

            {/* 工具列 */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-[500px] h-16 bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl border border-gray-200 flex items-center justify-around px-4">
              <button onClick={() => setShowAiMenu(!showAiMenu)} className={`p-3 rounded-2xl transition-all ${showAiMenu ? 'bg-orange-100 text-[#FF9500]' : 'text-[#FF9500] hover:bg-orange-50'}`}><Sparkles size={26} /></button>
              <div className="w-px h-8 bg-gray-200" />
              <button onClick={() => insertText('\n- [ ] ')} className="p-3 text-[#FF9500] hover:bg-orange-50 rounded-2xl"><CheckCircle2 size={26} /></button>
              <button className="p-3 text-[#FF9500] hover:bg-orange-50 rounded-2xl"><ImageIcon size={26} /></button>
              <button className="p-3 text-[#FF9500] hover:bg-orange-50 rounded-2xl"><TableIcon size={26} /></button>
              <div className="w-px h-8 bg-gray-200" />
              <button onClick={() => setSelectedNoteId(null)} className="text-[#FF9500] font-black text-lg px-2">完成</button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 bg-[#FCFCFD]"><SquarePen size={80} className="opacity-10 mb-4" /><p className="text-xl font-bold">選取備忘錄開始編輯</p></div>
        )}
      </div>

      {/* 分享面板 */}
      {showShareModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div className="w-full max-w-xl bg-[#F2F2F7] rounded-t-[40px] p-8 shadow-2xl animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-8" />
            <div className="flex items-center gap-5 mb-10 bg-white p-5 rounded-3xl shadow-sm">
              <div className="w-16 h-16 bg-[#FF9500] rounded-2xl flex items-center justify-center text-white shadow-lg"><SquarePen size={32} /></div>
              <div><div className="font-black text-xl">{currentNote?.title}</div><div className="text-sm text-gray-400 font-bold">iCloud 備忘錄</div></div>
            </div>
            <div className="grid grid-cols-4 gap-6 mb-10 text-center">
              {[{i:<Mail/>,l:'郵件',c:'bg-blue-500'},{i:<Copy/>,l:'拷貝',c:'bg-orange-500',a:()=>navigator.clipboard.writeText(currentNote.content)},{i:<Link/>,l:'連結',c:'bg-purple-500'},{i:<MoreHorizontal/>,l:'更多',c:'bg-gray-400'}].map((x,i)=>(
                <div key={i} className="flex flex-col items-center gap-3 cursor-pointer" onClick={x.a}>
                  <div className={`${x.c} w-16 h-16 rounded-[22px] flex items-center justify-center text-white shadow-md active:scale-90 transition-transform`}>{React.cloneElement(x.i,{size:28})}</div>
                  <span className="text-xs font-bold text-gray-600">{x.l}</span>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-[28px] overflow-hidden mb-10">
              {['在備忘錄中尋找','儲存到檔案','列印'].map((t,i)=><div key={i} className="p-5 font-bold text-gray-800 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">{t}</div>)}
            </div>
          </div>
        </div>
      )}

      <style>{`
        body { background-color: #F2F2F7; -webkit-font-smoothing: antialiased; }
        textarea { caret-color: #FF9500; }
        ::selection { background-color: rgba(255, 149, 0, 0.2); }
      `}</style>
    </div>
  );
};

// React 18 渲染入口
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
