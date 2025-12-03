'use client'

import { useState, useEffect } from 'react'
import { supabase } from './utils/supabaseClient'
import { Search, BookOpen, Brain, LogOut, Trash2, CheckCircle, AlertCircle, Plus, GraduationCap, X } from 'lucide-react'

export default function Home() {
  const [user, setUser] = useState(null)
  const [view, setView] = useState('search') // 'search' | 'library' | 'practice'
  
  // --- State ---
  const [query, setQuery] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [myWords, setMyWords] = useState([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [selectedWord, setSelectedWord] = useState(null)
  
  // Practice State
  const [practiceQueue, setPracticeQueue] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [practiceFinished, setPracticeFinished] = useState(false)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [allMastered, setAllMastered] = useState(false)

  // --- Auth & Init ---
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user) return
    if (view === 'library') fetchLibrary()
    if (view === 'practice') startPracticeSession(false)
  }, [view, user])

  // --- Functions ---
  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setErrorMsg(''); setResult(null); setSaveStatus(null)
    try {
      const res = await fetch(`/api/dictionary?word=${query}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '查詢失敗')
      setResult(data)
    } catch (err) { setErrorMsg(err.message) } finally { setLoading(false) }
  }

  const addToLibrary = async () => {
    if (!user || !result) return
    setIsSaving(true)
    try {
      const { data: existingWords, error: checkError } = await supabase
        .from('user_vocabularies').select('id').eq('user_id', user.id).eq('word', result.word)
      if (checkError) throw checkError
      if (existingWords && existingWords.length > 0) {
        alert(`「${result.word}」已經在你的單字庫囉！`)
        setIsSaving(false); return
      }
      const { error: insertError } = await supabase.from('user_vocabularies').insert({
        user_id: user.id,
        word: result.word,
        definition_cn: result.definition,
        sentence_1_en: result.examples[0]?.en || '',
        sentence_1_cn: result.examples[0]?.cn || '',
        sentence_2_en: result.examples[1]?.en || '',
        sentence_2_cn: result.examples[1]?.cn || '',
        status: 0
      })
      if (insertError) throw insertError
      setSaveStatus('success')
      setTimeout(() => { setQuery(''); setResult(null); setSaveStatus(null) }, 1500)
    } catch (err) { console.error(err); setSaveStatus('error'); alert('加入失敗') } finally { setIsSaving(false) }
  }

  const fetchLibrary = async () => {
    setLibraryLoading(true)
    const { data, error } = await supabase.from('user_vocabularies').select('*').order('created_at', { ascending: false })
    if (error) console.error(error)
    else setMyWords(data || [])
    setLibraryLoading(false)
  }

  const handleDelete = async (id) => {
    if (!confirm('確定刪除？')) return
    const { error } = await supabase.from('user_vocabularies').delete().eq('id', id)
    if (!error) { setMyWords(prev => prev.filter(w => w.id !== id)); setSelectedWord(null) }
  }

  const startPracticeSession = async (forceReview = false) => {
    setPracticeLoading(true); setPracticeFinished(false); setAllMastered(false); setCurrentIndex(0); setIsFlipped(false)
    const { data, error } = await supabase.from('user_vocabularies').select('*')
    if (error || !data || data.length === 0) { setPracticeQueue([]); setPracticeLoading(false); return }
    
    let targets = forceReview ? data : data.filter(w => w.status < 2)
    if (targets.length === 0 && data.length > 0) { setAllMastered(true); setPracticeLoading(false); return }
    
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    setPracticeQueue(targets); setPracticeLoading(false)
  }

  const updateStatus = async (newStatus) => {
    const currentWord = practiceQueue[currentIndex]
    if (!currentWord) return
    const { error } = await supabase.from('user_vocabularies').update({ status: newStatus }).eq('id', currentWord.id)
    if (error) { alert('更新失敗'); return }
    setTimeout(() => {
      setIsFlipped(false)
      setTimeout(() => {
        if (currentIndex < practiceQueue.length - 1) setCurrentIndex(prev => prev + 1)
        else setPracticeFinished(true)
      }, 300)
    }, 200)
  }

  const handleLogin = async () => { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}` } }) }
  const handleLogout = async () => { await supabase.auth.signOut(); setResult(null); setQuery(''); setView('search') }

  // UI Helpers
  const getStatusColor = (status) => {
    if (status === 2) return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    if (status === 1) return 'bg-amber-100 text-amber-700 border-amber-200'
    return 'bg-rose-100 text-rose-700 border-rose-200'
  }
  const getStatusText = (status) => {
    if (status === 2) return '熟單字'
    if (status === 1) return '半熟'
    return '生單字'
  }

  // --- Render ---

  // 1. Login Page (這裡是你看到的新版登入頁)
  if (!user) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 font-sans">
      <div className="max-w-md w-full bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl p-10 text-center border border-white/50">
        <div className="w-20 h-20 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg transform -rotate-6">
          <Brain className="text-white w-10 h-10" />
        </div>
        <h1 className="text-4xl font-extrabold mb-3 text-gray-900 tracking-tight">Vocab Master</h1>
        <p className="text-gray-500 mb-10 text-lg">打造你的專屬英文單字庫，<br/>用科學方法記憶單字。</p>
        <button onClick={handleLogin} className="w-full py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-xl font-bold text-lg transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-3">
          <svg className="w-6 h-6" viewBox="0 0 24 24"><path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/></svg>
          使用 Google 登入
        </button>
      </div>
    </div>
  )

  // 2. Main App (這裡必須也是新版程式碼，才能看到美化後的介面)
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-gray-900 selection:bg-indigo-100 selection:text-indigo-700">
      
      {/* Navbar (Glassmorphism) */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center text-white">
              <BookOpen size={18} />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-800">Vocab Master</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-500 hidden sm:block bg-slate-100 px-3 py-1 rounded-full">{user.email}</span>
            <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-full hover:bg-rose-50">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* View Switcher (Bottom on mobile, Top on desktop) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 sm:static sm:bg-transparent sm:border-none sm:pt-24 sm:pb-6">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex bg-white sm:bg-slate-200/50 sm:backdrop-blur-sm p-1 rounded-2xl sm:max-w-md sm:mx-auto shadow-lg sm:shadow-none border-t sm:border-none border-slate-100">
            {[
              { id: 'search', label: '查單字', icon: Search },
              { id: 'library', label: '單字庫', icon: BookOpen },
              { id: 'practice', label: '練習', icon: Brain },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 ${
                  view === item.id 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                }`}
              >
                <item.icon size={view === item.id ? 20 : 18} strokeWidth={view === item.id ? 2.5 : 2} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-4 pb-24 sm:pb-12 pt-20 sm:pt-0">
        
        {/* === VIEW: SEARCH === */}
        {view === 'search' && (
          <div className="animate-fade-in max-w-2xl mx-auto">
            <div className="text-center mb-8 sm:mb-12 mt-4 sm:mt-10">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-3">發現新單字</h1>
              <p className="text-slate-500">輸入你想學習的英文單字，AI 幫你建立例句。</p>
            </div>

            <form onSubmit={handleSearch} className="mb-8 relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-indigo-500 transition-colors">
                <Search size={24} />
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="例如: Serendipity..."
                className="w-full py-5 pl-14 pr-24 rounded-2xl border-2 border-slate-200 bg-white shadow-xl shadow-slate-200/50 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 text-xl font-medium text-slate-900 placeholder:text-slate-300 transition-all"
              />
              <button 
                type="submit" 
                disabled={loading} 
                className="absolute right-3 top-3 bottom-3 bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
              >
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> : '查詢'}
              </button>
            </form>

            {errorMsg && (
              <div className="bg-rose-50 text-rose-600 p-4 rounded-xl flex items-center justify-center gap-2 border border-rose-100">
                <AlertCircle size={20} /> {errorMsg}
              </div>
            )}

            {result && (
              <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/60 overflow-hidden border border-slate-100 animate-slide-up">
                <div className="p-8 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-4xl font-black text-slate-900 capitalize tracking-tight">{result.word}</h2>
                      <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-sm font-bold border border-indigo-100">
                        {result.definition}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-8 space-y-6">
                  {result.examples.map((ex, idx) => (
                    <div key={idx} className="relative pl-6 border-l-4 border-indigo-200">
                      <p className="text-xl text-slate-800 mb-2 font-serif leading-relaxed">"{ex.en}"</p>
                      <p className="text-slate-500 text-base">{ex.cn}</p>
                    </div>
                  ))}
                </div>

                <div className="p-8 pt-0">
                  <button 
                    onClick={addToLibrary} 
                    disabled={isSaving || saveStatus === 'success'} 
                    className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                      saveStatus === 'success' 
                        ? 'bg-emerald-500 text-white shadow-emerald-200' 
                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-300/50 hover:shadow-2xl hover:-translate-y-1'
                    }`}
                  >
                    {isSaving ? '儲存中...' : saveStatus === 'success' ? <><CheckCircle size={24}/> 已加入單字庫</> : <><Plus size={24}/> 加入單字庫</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* === VIEW: LIBRARY === */}
        {view === 'library' && (
          <div className="animate-fade-in">
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-2xl font-bold text-slate-800">我的單字庫</h2>
              <span className="text-slate-400 text-sm font-medium">{myWords.length} 個單字</span>
            </div>

            {libraryLoading ? (
              <div className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div></div>
            ) : myWords.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <BookOpen size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 text-lg">單字庫還是空的</p>
                <button onClick={() => setView('search')} className="text-indigo-600 font-bold hover:underline mt-2">去查幾個單字吧！</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {myWords.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => setSelectedWord(item)}
                    className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg hover:border-indigo-100 transition-all cursor-pointer group flex justify-between items-start"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 capitalize mb-1 group-hover:text-indigo-600 transition-colors">{item.word}</h3>
                      <p className="text-slate-500 text-sm line-clamp-1">{item.definition_cn}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${getStatusColor(item.status)}`}>
                      {getStatusText(item.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* === VIEW: PRACTICE === */}
        {view === 'practice' && (
          <div className="h-[calc(100vh-180px)] sm:h-[600px] flex flex-col items-center justify-center animate-fade-in">
            {practiceLoading ? (
              <div className="text-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-100 border-t-indigo-600 mx-auto mb-4"></div><p className="text-slate-500 font-medium">準備牌組中...</p></div>
            ) : allMastered ? (
              <div className="text-center p-10 bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm mx-4 animate-scale-up">
                <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">🏆</div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">太強了！全部精通</h2>
                <p className="text-slate-500 mb-8">你的單字庫中已經沒有生字囉。</p>
                <div className="flex flex-col gap-3">
                  <button onClick={() => startPracticeSession(true)} className="px-8 py-3 bg-yellow-500 text-white font-bold rounded-xl hover:bg-yellow-600 transition shadow-lg shadow-yellow-200">複習熟單字</button>
                  <button onClick={() => setView('search')} className="px-8 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition">去新增更多單字</button>
                </div>
              </div>
            ) : practiceFinished ? (
              <div className="text-center p-10 bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-sm mx-4 animate-scale-up">
                <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6 text-6xl">🎉</div>
                <h2 className="text-2xl font-black text-slate-900 mb-2">練習結束！</h2>
                <p className="text-slate-500 mb-8">這組單字你都複習完了。</p>
                <button onClick={() => startPracticeSession(false)} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">再來一輪</button>
              </div>
            ) : practiceQueue.length === 0 ? (
              <div className="text-center text-slate-400">
                <BookOpen size={64} className="mx-auto mb-4 opacity-20"/>
                <p>單字庫是空的，無法練習。</p>
                <button onClick={() => setView('search')} className="text-indigo-500 font-bold hover:underline mt-2">去新增單字</button>
              </div>
            ) : practiceQueue[currentIndex] && (
              <div className="relative w-full max-w-sm aspect-[3/4] perspective-1000">
                <div className="absolute -top-12 left-0 right-0 text-center">
                  <span className="bg-slate-800 text-white text-xs font-bold px-3 py-1 rounded-full">{currentIndex + 1} / {practiceQueue.length}</span>
                </div>

                <div 
                  className={`relative w-full h-full transition-transform duration-500 transform-style-3d cursor-pointer ${isFlipped ? 'rotate-y-180' : ''}`}
                  onClick={() => !isFlipped && setIsFlipped(true)}
                >
                  {/* FRONT */}
                  <div className="absolute inset-0 backface-hidden bg-white rounded-3xl shadow-2xl shadow-indigo-200/50 border border-slate-100 flex flex-col items-center justify-center p-8 text-center hover:-translate-y-1 transition-transform duration-300">
                    <div className="flex-1 flex flex-col items-center justify-center w-full">
                      <h3 className="text-5xl font-black text-slate-800 capitalize mb-10 tracking-tight">{practiceQueue[currentIndex].word}</h3>
                      <div className="space-y-4 text-left w-full">
                        {practiceQueue[currentIndex].sentence_1_en && (
                          <p className="text-slate-600 text-lg font-serif leading-relaxed border-l-4 border-indigo-200 pl-4 py-1 italic">
                            "{practiceQueue[currentIndex].sentence_1_en}"
                          </p>
                        )}
                        {practiceQueue[currentIndex].sentence_2_en && (
                          <p className="text-slate-600 text-lg font-serif leading-relaxed border-l-4 border-indigo-200 pl-4 py-1 italic">
                            "{practiceQueue[currentIndex].sentence_2_en}"
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-8 text-indigo-400 text-sm font-bold animate-pulse flex items-center gap-2">
                      點擊翻看答案 <GraduationCap size={16} />
                    </div>
                  </div>

                  {/* BACK */}
                  <div className="absolute inset-0 backface-hidden rotate-y-180 bg-white rounded-3xl shadow-2xl shadow-slate-300/50 border border-slate-100 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                      <div className="text-center pb-6 border-b border-slate-100">
                        <h3 className="text-3xl font-black text-indigo-600 capitalize mb-2">{practiceQueue[currentIndex].word}</h3>
                        <p className="text-2xl text-slate-800 font-bold">{practiceQueue[currentIndex].definition_cn}</p>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <p className="text-slate-800 font-serif font-medium mb-2">"{practiceQueue[currentIndex].sentence_1_en}"</p>
                          <p className="text-slate-500 text-sm">{practiceQueue[currentIndex].sentence_1_cn}</p>
                        </div>
                        {practiceQueue[currentIndex].sentence_2_en && (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <p className="text-slate-800 font-serif font-medium mb-2">"{practiceQueue[currentIndex].sentence_2_en}"</p>
                            <p className="text-slate-500 text-sm">{practiceQueue[currentIndex].sentence_2_cn}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 border-t border-slate-100">
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(0); }} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-rose-100 shadow-sm text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-all active:scale-95">
                        <span className="text-xl mb-1">🔴</span><span className="text-xs font-bold">生單字</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(1); }} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-amber-100 shadow-sm text-amber-600 hover:bg-amber-50 hover:border-amber-300 transition-all active:scale-95">
                        <span className="text-xl mb-1">🟡</span><span className="text-xs font-bold">半熟</span>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); updateStatus(2); }} className="flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-emerald-100 shadow-sm text-emerald-600 hover:bg-emerald-50 hover:border-emerald-300 transition-all active:scale-95">
                        <span className="text-xl mb-1">🟢</span><span className="text-xs font-bold">熟單字</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal - Details */}
      {selectedWord && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setSelectedWord(null)}>
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-scale-up border border-white/50" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex justify-between items-start">
              <div>
                <h2 className="text-3xl font-black text-slate-900 capitalize">{selectedWord.word}</h2>
                <p className="text-lg text-indigo-600 font-bold mt-1">{selectedWord.definition_cn}</p>
              </div>
              <button onClick={() => handleDelete(selectedWord.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-full transition-colors">
                <Trash2 size={20} />
              </button>
            </div>
            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-400">學習狀態</span>
                <span className={`text-xs px-3 py-1 rounded-full font-bold border ${getStatusColor(selectedWord.status)}`}>{getStatusText(selectedWord.status)}</span>
              </div>
              <div className="space-y-4">
                <div className="pl-4 border-l-4 border-slate-200">
                  <p className="text-slate-800 font-serif text-lg mb-1">"{selectedWord.sentence_1_en}"</p>
                  <p className="text-slate-500">{selectedWord.sentence_1_cn}</p>
                </div>
                {selectedWord.sentence_2_en && (
                  <div className="pl-4 border-l-4 border-slate-200">
                    <p className="text-slate-800 font-serif text-lg mb-1">"{selectedWord.sentence_2_en}"</p>
                    <p className="text-slate-500">{selectedWord.sentence_2_cn}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
              <button onClick={() => setSelectedWord(null)} className="text-slate-600 font-bold hover:bg-white hover:text-indigo-600 px-8 py-2.5 rounded-xl border border-transparent hover:border-slate-200 hover:shadow-sm transition-all">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.4s ease-out; }
        @keyframes scale-up { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-scale-up { animation: scale-up 0.2s ease-out cubic-bezier(0.175, 0.885, 0.32, 1.275); }
      `}</style>
    </div>
  )
}