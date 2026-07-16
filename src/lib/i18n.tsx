import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type LangCode =
  | "en" | "bn" | "zh" | "hi" | "es" | "ar" | "pt" | "ru" | "ur";

export const LANGUAGES: { code: LangCode; label: string; native: string; flag: string; dir?: "rtl" }[] = [
  { code: "en", label: "English",              native: "English",     flag: "🇬🇧" },
  { code: "bn", label: "Bengali",              native: "বাংলা",         flag: "🇧🇩" },
  { code: "zh", label: "Mandarin Chinese",     native: "中文",          flag: "🇨🇳" },
  { code: "hi", label: "Hindi",                native: "हिन्दी",         flag: "🇮🇳" },
  { code: "es", label: "Spanish",              native: "Español",     flag: "🇪🇸" },
  { code: "ar", label: "Modern Standard Arabic", native: "العربية",   flag: "🇸🇦", dir: "rtl" },
  { code: "pt", label: "Portuguese",           native: "Português",   flag: "🇵🇹" },
  { code: "ru", label: "Russian",              native: "Русский",     flag: "🇷🇺" },
  { code: "ur", label: "Urdu",                 native: "اردو",         flag: "🇵🇰", dir: "rtl" },
];

// Keep the key list flat and stable. Missing keys fall back to English.
const DICT = {
  en: {
    dashboard: "Dashboard", books: "Books", categories: "Categories",
    issues: "Book Issues", overdue: "Overdue", fines: "Fines",
    students: "Students", reports: "Reports", settings: "Settings",
    section_library: "Library", section_circulation: "Circulation",
    section_users_reports: "Users & Reports",
    librarian: "Librarian", logout: "Logout", language: "Language",
    overdue_books: "Overdue Books",
  },
  bn: {
    dashboard: "ড্যাশবোর্ড", books: "বই", categories: "বিভাগ",
    issues: "বই ইস্যু", overdue: "মেয়াদোত্তীর্ণ", fines: "জরিমানা",
    students: "শিক্ষার্থী", reports: "রিপোর্ট", settings: "সেটিংস",
    section_library: "লাইব্রেরি", section_circulation: "সার্কুলেশন",
    section_users_reports: "ব্যবহারকারী ও রিপোর্ট",
    librarian: "লাইব্রেরিয়ান", logout: "লগ আউট", language: "ভাষা",
    overdue_books: "মেয়াদোত্তীর্ণ বই",
  },
  zh: {
    dashboard: "仪表盘", books: "图书", categories: "分类",
    issues: "借阅记录", overdue: "逾期", fines: "罚款",
    students: "学生", reports: "报表", settings: "设置",
    section_library: "图书馆", section_circulation: "流通",
    section_users_reports: "用户与报表",
    librarian: "图书管理员", logout: "退出", language: "语言",
    overdue_books: "逾期图书",
  },
  hi: {
    dashboard: "डैशबोर्ड", books: "पुस्तकें", categories: "श्रेणियाँ",
    issues: "पुस्तक निर्गमन", overdue: "अतिदेय", fines: "जुर्माना",
    students: "छात्र", reports: "रिपोर्ट", settings: "सेटिंग्स",
    section_library: "पुस्तकालय", section_circulation: "परिचालन",
    section_users_reports: "उपयोगकर्ता व रिपोर्ट",
    librarian: "पुस्तकालयाध्यक्ष", logout: "लॉग आउट", language: "भाषा",
    overdue_books: "अतिदेय पुस्तकें",
  },
  es: {
    dashboard: "Panel", books: "Libros", categories: "Categorías",
    issues: "Préstamos", overdue: "Atrasados", fines: "Multas",
    students: "Estudiantes", reports: "Informes", settings: "Ajustes",
    section_library: "Biblioteca", section_circulation: "Circulación",
    section_users_reports: "Usuarios e informes",
    librarian: "Bibliotecario", logout: "Cerrar sesión", language: "Idioma",
    overdue_books: "Libros atrasados",
  },
  ar: {
    dashboard: "لوحة التحكم", books: "الكتب", categories: "التصنيفات",
    issues: "إعارات الكتب", overdue: "المتأخرة", fines: "الغرامات",
    students: "الطلاب", reports: "التقارير", settings: "الإعدادات",
    section_library: "المكتبة", section_circulation: "الإعارة",
    section_users_reports: "المستخدمون والتقارير",
    librarian: "أمين المكتبة", logout: "تسجيل الخروج", language: "اللغة",
    overdue_books: "الكتب المتأخرة",
  },
  pt: {
    dashboard: "Painel", books: "Livros", categories: "Categorias",
    issues: "Empréstimos", overdue: "Atrasados", fines: "Multas",
    students: "Alunos", reports: "Relatórios", settings: "Configurações",
    section_library: "Biblioteca", section_circulation: "Circulação",
    section_users_reports: "Usuários e relatórios",
    librarian: "Bibliotecário", logout: "Sair", language: "Idioma",
    overdue_books: "Livros atrasados",
  },
  ru: {
    dashboard: "Панель", books: "Книги", categories: "Категории",
    issues: "Выдачи", overdue: "Просрочено", fines: "Штрафы",
    students: "Студенты", reports: "Отчёты", settings: "Настройки",
    section_library: "Библиотека", section_circulation: "Обращение",
    section_users_reports: "Пользователи и отчёты",
    librarian: "Библиотекарь", logout: "Выйти", language: "Язык",
    overdue_books: "Просроченные книги",
  },
  ur: {
    dashboard: "ڈیش بورڈ", books: "کتابیں", categories: "زمرے",
    issues: "کتاب کا اجرا", overdue: "زائد المیعاد", fines: "جرمانے",
    students: "طلبا", reports: "رپورٹس", settings: "ترتیبات",
    section_library: "لائبریری", section_circulation: "گردش",
    section_users_reports: "صارفین و رپورٹس",
    librarian: "لائبریرین", logout: "لاگ آؤٹ", language: "زبان",
    overdue_books: "زائد المیعاد کتابیں",
  },
} satisfies Record<LangCode, Record<string, string>>;

export type TranslationKey = keyof typeof DICT["en"];

const STORAGE_KEY = "lp-lang";

function readSaved(): LangCode {
  if (typeof window === "undefined") return "en";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw && LANGUAGES.some((l) => l.code === raw)) return raw as LangCode;
  return "en";
}

type Ctx = { lang: LangCode; setLang: (l: LangCode) => void; t: (k: TranslationKey) => string };
const LangContext = createContext<Ctx | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>("en");
  // Read from storage after mount to avoid SSR hydration mismatch.
  useEffect(() => { setLangState(readSaved()); }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const meta = LANGUAGES.find((l) => l.code === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = meta?.dir === "rtl" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((k: TranslationKey) => {
    const row = DICT[lang] as Record<string, string>;
    return row[k] ?? DICT.en[k] ?? k;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  // Safe fallback so components mounted outside a provider still render.
  return { lang: "en", setLang: () => {}, t: (k) => DICT.en[k] ?? k };
}

export function localeFor(lang: LangCode): string {
  switch (lang) {
    case "en": return "en-US";
    case "bn": return "bn-BD";
    case "zh": return "zh-CN";
    case "hi": return "hi-IN";
    case "es": return "es-ES";
    case "ar": return "ar-SA";
    case "pt": return "pt-PT";
    case "ru": return "ru-RU";
    case "ur": return "ur-PK";
  }
}