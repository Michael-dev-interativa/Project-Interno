/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import AnaliseConcepcaoPlanejamento from './pages/AnaliseConcepcaoPlanejamento';
import Analitico from './pages/Analitico';
import AtaPlanejamento from './pages/AtaPlanejamento';
import AtividadesRapidas from './pages/AtividadesRapidas';
import ChecklistPlanejamento from './pages/ChecklistPlanejamento';
import Comercial from './pages/Comercial';
import ComercialDetalhes from './pages/ComercialDetalhes';
import Configuracoes from './pages/Configuracoes';
import ControleOSGlobal from './pages/ControleOSGlobal';
import Dashboard from './pages/Dashboard';
import Empreendimento from './pages/Empreendimento';
import Empreendimentos from './pages/Empreendimentos';
import Home from './pages/Home';
import Orcamentos from './pages/Orcamentos';
import PRE from './pages/PRE';
import Planejamento from './pages/Planejamento';
import Propostas from './pages/Propostas';
import Relatorios from './pages/Relatorios';
import SeletorPlanejamento from './pages/SeletorPlanejamento';
import Usuarios from './pages/Usuarios';
import __Layout from './Layout.jsx';


export const PAGES = {
    "AnaliseConcepcaoPlanejamento": AnaliseConcepcaoPlanejamento,
    "Analitico": Analitico,
    "AtaPlanejamento": AtaPlanejamento,
    "AtividadesRapidas": AtividadesRapidas,
    "ChecklistPlanejamento": ChecklistPlanejamento,
    "Comercial": Comercial,
    "ComercialDetalhes": ComercialDetalhes,
    "Configuracoes": Configuracoes,
    "ControleOSGlobal": ControleOSGlobal,
    "Dashboard": Dashboard,
    "Empreendimento": Empreendimento,
    "Empreendimentos": Empreendimentos,
    "Home": Home,
    "Orcamentos": Orcamentos,
    "PRE": PRE,
    "Planejamento": Planejamento,
    "Propostas": Propostas,
    "Relatorios": Relatorios,
    "SeletorPlanejamento": SeletorPlanejamento,
    "Usuarios": Usuarios,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};