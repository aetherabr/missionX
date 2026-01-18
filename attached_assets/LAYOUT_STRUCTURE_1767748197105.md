# Estrutura de Layout - Mission Ctrl

Este documento descreve detalhadamente a estrutura base da aplicação (Sidebar + Topbar) para permitir replicação fiel por qualquer agente de IA generativa.


---

## 1. SIDEBAR (Menu Lateral)

### 1.1 Posicionamento e Dimensões

```
Posição: fixed, left: 0, top: 0
Altura: 100vh (h-screen)
Z-Index: z-50
Orientação: flex-col (coluna vertical)
```

**Larguras por Estado e Viewport:**

| Estado    | Mobile (<1024px) | Desktop (>=1024px) |
| --------- | ---------------- | ------------------ |
| Expandido | 280px            | 295px              |
| Colapsado | N/A (não existe) | 80px (5rem)        |

**Classes Tailwind Completas:**
```css
w-[280px]                      /* Largura mobile */
lg:w-[295px]                   /* Largura desktop expandido */
lg:w-20                        /* Largura desktop colapsado (quando collapsed=true) */
```

### 1.2 Comportamento Responsivo Detalhado

#### Mobile (< 1024px / lg breakpoint)

**Estado Padrão (Menu Fechado):**
- Sidebar completamente oculta fora da tela
- Transform: `-translate-x-full` (deslocada 100% para esquerda)

**Estado Aberto (mobileMenuOpen=true):**
- Sidebar visível
- Transform: `translate-x-0`
- Background mais sólido para contraste: `bg-dark-800/95` (95% opacidade)

**Acionamento:**
- Botão de menu (ícone `Menu`) na Topbar
- Ao clicar em item de menu, sidebar deve fechar automaticamente

#### Desktop (>= 1024px)

- Sidebar SEMPRE visível: `lg:translate-x-0`
- Toggle de colapso disponível
- Background mais translúcido: `lg:bg-dark-800/50` (50% opacidade)
- Dois estados: expandido (295px) ou colapsado (80px)

### 1.3 Estilos de Background e Borda por Tema

**Dark Mode:**
```css
/* Mobile */
bg-dark-800/95

/* Desktop */
lg:bg-dark-800/50

/* Comum */
border-r border-dark-700
backdrop-blur-md
```

**Light Mode:**
```css
/* Mobile */
bg-white/95

/* Desktop */
lg:bg-white/80

/* Comum */
border-r border-gray-200
shadow-sm
backdrop-blur-md
```

### 1.4 Estrutura Interna (3 Seções)

```
┌─────────────────────────────────────┐
│            HEADER (h-20)            │
│  [Hexagon Logo]  [Texto]   [Toggle] │
│                           (absoluto)│
├─────────────────────────────────────┤  ← border-b (dark-700 / gray-200)
│                                     │
│         NAVEGAÇÃO (flex-1)          │
│              py-8 px-3              │
│                                     │
│    [Dashboard]                      │
│    [Profiles]                       │
│    [Reports]                        │
│    [Settings]                       │
│                                     │
├─────────────────────────────────────┤  ← border-t (dark-700 / gray-200)
│           FOOTER (p-4)              │
│    [Logout]                         │
└─────────────────────────────────────┘
```

---

### 1.5 HEADER DA SIDEBAR (Logo + Toggle)

**Container:**
```css
h-20                           /* Altura: 80px */
flex items-center              /* Alinhamento vertical centralizado */
px-6                           /* Padding horizontal: 24px */
relative                       /* Para posicionar toggle absoluto */
```

**Separador Inferior:**
- Dark: `border-b border-dark-700`
- Light: `border-b border-gray-200`

**Logo (Container):**
```jsx
<div className="flex items-center">
  <Hexagon className="text-brand-yellow w-8 h-8 fill-brand-yellow/20 flex-shrink-0" />
  <span className={`ml-3 font-bold text-xl tracking-tight ${collapsed ? 'lg:hidden' : ''}`}>
    Mission<span className="text-brand-yellow">Ctrl</span>
  </span>
</div>
```

**Especificações do Ícone do Logo:**
| Propriedade   | Valor                                  |
| ------------- | -------------------------------------- |
| Ícone         | `Hexagon` (Lucide React)               |
| Tamanho       | `w-8 h-8` (32x32px)                    |
| Cor do stroke | `text-brand-yellow` (#facc15)          |
| Fill          | `fill-brand-yellow/20` (20% opacidade) |
| Flex          | `flex-shrink-0`                        |

**Especificações do Texto do Logo:**
| Propriedade              | Valor                                           |
| ------------------------ | ----------------------------------------------- |
| Margin left              | `ml-3` (12px)                                   |
| Tipografia               | `font-bold text-xl tracking-tight`              |
| Texto "Mission"          | Cor do tema (white em dark / gray-900 em light) |
| Texto "Ctrl"             | `text-brand-yellow` (#facc15)                   |
| Visibilidade (colapsado) | `lg:hidden`                                     |

---

### 1.6 TOGGLE DE COLAPSO (Botão)

**Posicionamento Absoluto:**
```css
absolute                       /* Posição absoluta relativa ao header */
-right-3.5                     /* 14px para FORA da borda direita da sidebar */
top-1/2                        /* Centralizado verticalmente */
-translate-y-1/2               /* Ajuste preciso da centralização */
```

**Dimensões e Estrutura:**
```css
w-7 h-7                        /* 28x28px */
rounded-md                     /* Border radius: 6px */
shadow-lg                      /* Sombra para destacar sobre conteúdo */
hidden lg:flex                 /* OCULTO em mobile, visível em desktop */
items-center justify-center    /* Ícone centralizado */
transition-colors              /* Transição suave de cores */
```

**Estilos por Tema:**

| Tema  | Background    | Background Hover    | Texto           | Texto Hover           | Borda                    |
| ----- | ------------- | ------------------- | --------------- | --------------------- | ------------------------ |
| Dark  | `bg-dark-700` | `hover:bg-dark-600` | `text-gray-400` | `hover:text-white`    | `border border-dark-600` |
| Light | `bg-white`    | `hover:bg-gray-100` | `text-gray-500` | `hover:text-gray-900` | `border border-gray-300` |

**Ícones do Toggle (Lucide React):**

| Estado Sidebar | Ícone            | Tamanho   | Descrição Visual                                 |
| -------------- | ---------------- | --------- | ------------------------------------------------ |
| Expandido      | `PanelLeftClose` | `w-4 h-4` | Painel com seta apontando para esquerda (fechar) |
| Colapsado      | `PanelLeft`      | `w-4 h-4` | Painel com seta apontando para direita (abrir)   |

```jsx
{collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
```

---

### 1.7 ÁREA DE NAVEGAÇÃO

**Container:**
```css
flex-1                         /* Ocupa todo espaço disponível entre header e footer */
py-8                           /* Padding vertical: 32px */
px-3                           /* Padding horizontal: 12px */
flex flex-col                  /* Layout em coluna */
gap-2                          /* Espaçamento entre itens: 8px */
```

**Item de Menu - Estrutura JSX:**
```jsx
<button
  key={item.id}
  onClick={() => onChangeView(item.id)}
  className={`
    flex items-center
    ${collapsed ? 'lg:justify-center' : ''}
    p-3
    rounded-xl
    transition-all duration-200
    group
    ${isActive ? activeStyles : inactiveStyles}
  `}
>
  <item.icon className={`w-6 h-6 flex-shrink-0 ${iconStyles}`} />
  <span className={`ml-4 font-medium tracking-tight ${collapsed ? 'lg:hidden' : ''}`}>
    {item.label}
  </span>
  {isActive && (
    <div className={`ml-auto w-1.5 h-1.5 rounded-full ${collapsed ? 'lg:hidden' : ''} ${dotStyles}`} />
  )}
</button>
```

**Especificações do Item:**

| Propriedade              | Valor                         |
| ------------------------ | ----------------------------- |
| Padding                  | `p-3` (12px)                  |
| Border radius            | `rounded-xl` (12px)           |
| Transição                | `transition-all duration-200` |
| Justificação (colapsado) | `lg:justify-center`           |

**Estilos do Item - Estado ATIVO:**

| Tema  | Background              | Texto                         |
| ----- | ----------------------- | ----------------------------- |
| Dark  | `bg-dark-700`           | `text-brand-yellow` (#facc15) |
| Light | `bg-amber-50` (#fffbeb) | `text-amber-600` (#d97706)    |

**Estilos do Item - Estado INATIVO:**

| Tema  | Texto           | Hover BG            | Hover Texto           |
| ----- | --------------- | ------------------- | --------------------- |
| Dark  | `text-gray-400` | `hover:bg-dark-700` | `hover:text-white`    |
| Light | `text-gray-500` | `hover:bg-gray-100` | `hover:text-gray-900` |

**Ícone do Item:**
```css
w-6 h-6 flex-shrink-0
```

| Estado  | Tema  | Cor                 | Hover                       |
| ------- | ----- | ------------------- | --------------------------- |
| Ativo   | Dark  | `text-brand-yellow` | -                           |
| Ativo   | Light | `text-amber-600`    | -                           |
| Inativo | Dark  | `text-gray-500`     | `group-hover:text-white`    |
| Inativo | Light | `text-gray-400`     | `group-hover:text-gray-900` |

**Label do Item:**
```css
ml-4                           /* Margin left: 16px (espaço do ícone) */
font-medium                    /* Font weight: 500 */
tracking-tight                 /* Letter spacing: -0.02em */
${collapsed ? 'lg:hidden' : ''} /* Oculto quando sidebar colapsada */
```

**Indicador de Ativo (Dot):**
```css
ml-auto                        /* Alinhado à direita */
w-1.5 h-1.5                    /* 6x6px */
rounded-full                   /* Círculo perfeito */
${collapsed ? 'lg:hidden' : ''} /* Oculto quando sidebar colapsada */
```

| Tema  | Background        | Efeito Especial                           |
| ----- | ----------------- | ----------------------------------------- |
| Dark  | `bg-brand-yellow` | `shadow-[0_0_8px_#ffcd38]` (glow amarelo) |
| Light | `bg-amber-500`    | Nenhum                                    |

---

### 1.8 FOOTER DA SIDEBAR (Logout)

**Container:**
```css
p-4                            /* Padding: 16px */
```

**Separador Superior:**
- Dark: `border-t border-dark-700`
- Light: `border-t border-gray-200`

**Botão Logout:**
```css
flex items-center
${collapsed ? 'lg:justify-center' : ''}
w-full
p-3                            /* Padding: 12px */
rounded-xl                     /* Border radius: 12px */
transition-colors
```

**Estados de Hover:**

| Tema  | Texto Padrão    | Hover BG              | Hover Texto          |
| ----- | --------------- | --------------------- | -------------------- |
| Dark  | `text-gray-400` | `hover:bg-red-500/10` | `hover:text-red-500` |
| Light | `text-gray-500` | `hover:bg-red-50`     | `hover:text-red-600` |

**Ícone Logout:**
- Ícone: `LogOut` (Lucide React)
- Tamanho: `w-6 h-6`
- Flex: `flex-shrink-0`

**Label Logout:**
```css
ml-4 font-medium tracking-tight
${collapsed ? 'lg:hidden' : ''}
```

---

## 2. TOPBAR (Header)

### 2.1 Posicionamento e Dimensões

```css
sticky top-0                   /* Fixo no topo durante scroll */
z-40                           /* Abaixo da sidebar (z-50) */
```

**Alturas por Viewport:**

| Viewport           | Altura | Tailwind  |
| ------------------ | ------ | --------- |
| Mobile (<1024px)   | 64px   | `h-16`    |
| Desktop (>=1024px) | 80px   | `lg:h-20` |

**Padding Horizontal:**

| Viewport | Padding | Tailwind  |
| -------- | ------- | --------- |
| Mobile   | 16px    | `px-4`    |
| Desktop  | 32px    | `lg:px-8` |

### 2.2 Layout Interno

```css
flex items-center justify-between
backdrop-blur-md
transition-colors duration-300
```

**Diagrama do Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  [Menu] [Home] > [Page Title]                    [Theme] [UserMenu] │
│   ^^^   ^^^^^^^^^^^^^^^^^^^^^^                   ^^^^^^^  ^^^^^^^^  │
│ Mobile   Breadcrumb (parte oculta em mobile)     Sempre    Sempre   │
│  only                                                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Estilos de Background e Borda por Tema

**Dark Mode:**
```css
bg-dark-800/50
border-b border-dark-700
backdrop-blur-md
transition-colors duration-300
```

**Light Mode:**
```css
bg-white/80
border-b border-gray-200
shadow-sm
backdrop-blur-md
transition-colors duration-300
```

---

### 2.4 LADO ESQUERDO (Menu Mobile + Breadcrumb)

**Container:**
```css
flex items-center gap-3
```

#### Botão Menu Mobile

**Visibilidade:** Apenas em mobile (`lg:hidden`)

```css
lg:hidden                      /* Oculto em desktop */
p-2                            /* Padding: 8px */
rounded-lg                     /* Border radius: 8px */
transition-colors
```

**Ícone:** `Menu` (Lucide React) - `w-5 h-5` (20x20px)

**Estilos por Tema:**

| Tema  | Texto           | Hover Texto           | Hover BG            |
| ----- | --------------- | --------------------- | ------------------- |
| Dark  | `text-gray-400` | `hover:text-white`    | `hover:bg-dark-700` |
| Light | `text-gray-500` | `hover:text-gray-900` | `hover:bg-gray-100` |

**Função:** Ao clicar, alterna `mobileMenuOpen` state para mostrar/ocultar sidebar

#### Breadcrumb

```jsx
<nav className="flex items-center gap-2">
  <Home className={`w-4 h-4 hidden sm:block ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
  <ChevronRight className={`w-4 h-4 hidden sm:block ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
  <span className={`text-sm font-medium ${isDark ? 'text-brand-yellow' : 'text-amber-600'}`}>
    {currentConfig.label}
  </span>
</nav>
```

**Componentes do Breadcrumb:**

| Componente | Ícone          | Tamanho   | Visibilidade      | Cor Dark            | Cor Light        |
| ---------- | -------------- | --------- | ----------------- | ------------------- | ---------------- |
| Home       | `Home`         | `w-4 h-4` | `hidden sm:block` | `text-gray-500`     | `text-gray-400`  |
| Separator  | `ChevronRight` | `w-4 h-4` | `hidden sm:block` | `text-gray-600`     | `text-gray-300`  |
| Page Title | -              | `text-sm` | Sempre            | `text-brand-yellow` | `text-amber-600` |

**Tipografia do Título:**
```css
text-sm font-medium
```

**Nota sobre Parent Label:**
O sistema suporta exibição de parent (ex: "Profiles > Profile Details"), definido no `viewConfig`. Quando um parent existe, pode ser exibido antes do título atual.

---

### 2.5 LADO DIREITO (Ações)

**Container:**
```css
flex items-center gap-2 sm:gap-4
```

| Viewport | Gap               |
| -------- | ----------------- |
| Mobile   | 8px (`gap-2`)     |
| Tablet+  | 16px (`sm:gap-4`) |

---

### 2.6 BOTÃO TOGGLE TEMA (Dark/Light)

**Estrutura JSX:**
```jsx
<button 
  onClick={toggleTheme}
  className={`relative p-2 sm:p-2.5 rounded-lg transition-all ${buttonStyles}`}
  title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
>
  {theme === 'dark' ? (
    <Sun className="w-5 h-5" />
  ) : (
    <Moon className="w-5 h-5" />
  )}
</button>
```

**Dimensões:**

| Viewport | Padding           | Tamanho Aprox |
| -------- | ----------------- | ------------- |
| Mobile   | `p-2` (8px)       | 36x36px       |
| Tablet+  | `sm:p-2.5` (10px) | 40x40px       |

```css
rounded-lg                     /* Border radius: 8px */
transition-all
```

**Ícones por Tema Atual:**

| Tema Atual | Ícone Exibido | Tamanho             | Ação ao Clicar  |
| ---------- | ------------- | ------------------- | --------------- |
| Dark       | `Sun`         | `w-5 h-5` (20x20px) | Muda para Light |
| Light      | `Moon`        | `w-5 h-5` (20x20px) | Muda para Dark  |

**Estilos por Tema:**

| Tema  | Background       | Texto           | Hover Texto           | Hover BG            |
| ----- | ---------------- | --------------- | --------------------- | ------------------- |
| Dark  | `bg-dark-700/50` | `text-gray-400` | `hover:text-white`    | `hover:bg-dark-700` |
| Light | `bg-gray-100`    | `text-gray-600` | `hover:text-gray-900` | `hover:bg-gray-200` |

---

### 2.7 MENU DO USUÁRIO

**Container (Pill Shape):**
```css
flex items-center
gap-2 sm:gap-3                 /* 8px mobile, 12px tablet+ */
pl-1 sm:pl-1.5                 /* Padding left: 4px/6px */
pr-2 sm:pr-4                   /* Padding right: 8px/16px */
py-1 sm:py-1.5                 /* Padding vertical: 4px/6px */
rounded-full                   /* Pill shape (border-radius: 9999px) */
border
transition-all
cursor-pointer
group                          /* Para hover effects em elementos filhos */
```

**Estilos por Tema:**

| Tema  | Background       | Borda                | Hover BG            |
| ----- | ---------------- | -------------------- | ------------------- |
| Dark  | `bg-dark-700/50` | `border-dark-600/50` | `hover:bg-dark-700` |
| Light | `bg-gray-100`    | `border-gray-200`    | `hover:bg-gray-200` |

#### Avatar

```jsx
<img 
  src="[avatar-url]" 
  alt="Profile" 
  className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 ${avatarBorder}`}
/>
```

**Dimensões:**

| Viewport | Tamanho                   |
| -------- | ------------------------- |
| Mobile   | 32x32px (`w-8 h-8`)       |
| Tablet+  | 36x36px (`sm:w-9 sm:h-9`) |

**Estilos:**
```css
rounded-full                   /* Circular */
object-cover                   /* Imagem preenche sem distorcer */
border-2                       /* Borda de 2px */
```

**Cor da Borda:**
- Dark: `border-dark-600`
- Light: `border-gray-300`

#### Nome do Usuário

```css
text-sm font-medium tracking-tight
hidden lg:block                /* Visível apenas em desktop (>=1024px) */
```

**Cor:**
- Dark: `text-white`
- Light: `text-gray-900`

#### Ícone Dropdown

```css
w-4 h-4                        /* 16x16px */
hidden sm:block                /* Oculto em mobile pequeno (<640px) */
transition-colors
```

**Ícone:** `ChevronDown` (Lucide React)

**Cores:**

| Tema  | Padrão          | Hover (via group-hover)     |
| ----- | --------------- | --------------------------- |
| Dark  | `text-gray-500` | `group-hover:text-gray-300` |
| Light | `text-gray-400` | `group-hover:text-gray-600` |

---

## 3. LAYOUT PRINCIPAL (Main Content)

### 3.1 Estrutura Geral

```jsx
<div className="min-h-screen flex">
  <Sidebar 
    collapsed={sidebarCollapsed}
    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
    mobileMenuOpen={mobileMenuOpen}
    onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
  />
  
  <main className={`flex-1 transition-all duration-300 ${mainMargin}`}>
    <Header 
      currentView={currentView}
      onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
    />
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Conteúdo da página */}
    </div>
  </main>
</div>
```

### 3.2 Margem do Main (para sidebar)

**Desktop Only (mobile não tem margem pois sidebar é overlay):**

| Estado Sidebar | Margem | Tailwind        |
| -------------- | ------ | --------------- |
| Expandida      | 295px  | `lg:ml-[295px]` |
| Colapsada      | 80px   | `lg:ml-20`      |

```css
transition-all duration-300    /* Animação suave ao colapsar/expandir */
```

### 3.3 Padding do Conteúdo

| Viewport | Padding | Tailwind |
| -------- | ------- | -------- |
| Mobile   | 16px    | `p-4`    |
| Tablet   | 24px    | `sm:p-6` |
| Desktop  | 32px    | `lg:p-8` |

---

## 4. ESTADOS E INTERAÇÕES

### 4.1 Estados Globais Necessários

```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
const [currentView, setCurrentView] = useState<ViewState>('DASHBOARD');
const { theme, toggleTheme } = useTheme();
```

### 4.2 Interações de Menu Mobile

1. **Abrir Menu:** Clique no botão `Menu` na topbar (invoca `onMobileMenuToggle`)
2. **Fechar Menu:** 
   - Clique em item de navegação (o fechamento ocorre no **componente pai** App.tsx via `handleViewChange`, NÃO na Sidebar)
   - Clique fora da sidebar (implementação opcional de overlay)

**Nota Arquitetural:** A Sidebar recebe `onChangeView` do pai. O App.tsx wrapper (`handleViewChange`) chama `setMobileMenuOpen(false)` ANTES de atualizar a view, garantindo que o menu feche. A Sidebar em si não possui lógica de fechamento - apenas dispara `onChangeView(viewId)`.

### 4.3 Interações de Colapso (Desktop)

1. **Toggle:** Clique no botão de toggle (metade fora da sidebar)
2. **Efeito:** 
   - Sidebar muda de 295px para 80px (ou vice-versa)
   - Labels e indicadores ficam ocultos (`lg:hidden`)
   - Main content ajusta margem automaticamente

---

## 5. ÍCONES UTILIZADOS (Lucide React)

| Componente           | Ícone            | Tamanho   | Uso                      |
| -------------------- | ---------------- | --------- | ------------------------ |
| Logo                 | `Hexagon`        | `w-8 h-8` | Símbolo da marca         |
| Toggle Expandido     | `PanelLeftClose` | `w-4 h-4` | Indicar "fechar sidebar" |
| Toggle Colapsado     | `PanelLeft`      | `w-4 h-4` | Indicar "abrir sidebar"  |
| Menu Mobile          | `Menu`           | `w-5 h-5` | Abrir menu em mobile     |
| Breadcrumb Home      | `Home`           | `w-4 h-4` | Início do breadcrumb     |
| Breadcrumb Separator | `ChevronRight`   | `w-4 h-4` | Separador >              |
| Theme Dark→Light     | `Sun`            | `w-5 h-5` | Trocar para light mode   |
| Theme Light→Dark     | `Moon`           | `w-5 h-5` | Trocar para dark mode    |
| User Dropdown        | `ChevronDown`    | `w-4 h-4` | Indicar menu dropdown    |
| Logout               | `LogOut`         | `w-6 h-6` | Ação de sair             |

---

## 6. TRANSIÇÕES E ANIMAÇÕES

| Elemento                   | Propriedade | Duração | Tailwind                                |
| -------------------------- | ----------- | ------- | --------------------------------------- |
| Sidebar slide (mobile)     | transform   | 300ms   | `transition-all duration-300`           |
| Sidebar collapse (desktop) | width       | 300ms   | `transition-all duration-300`           |
| Main content margin        | margin-left | 300ms   | `transition-all duration-300`           |
| Cores de tema (global)     | colors      | 300ms   | `transition-colors duration-300`        |
| Hover de botões            | all/colors  | 200ms   | `transition-all` ou `transition-colors` |
| Items de menu              | all         | 200ms   | `transition-all duration-200`           |

---

## 7. CONSIDERAÇÕES DE RESPONSIVIDADE

### Breakpoints Utilizados

| Breakpoint | Valor  | Uso Principal                                            |
| ---------- | ------ | -------------------------------------------------------- |
| `sm:`      | 640px  | Ajustes de padding, gaps, tamanhos de fonte              |
| `lg:`      | 1024px | Sidebar always visible, collapse toggle, desktop layouts |

### Elementos com Visibilidade Condicional

| Elemento                   | Mobile (<640px) | Tablet (640-1023px) | Desktop (>=1024px) |
| -------------------------- | --------------- | ------------------- | ------------------ |
| Menu Mobile Button         | Visível         | Visível             | Oculto             |
| Breadcrumb Icons           | Oculto          | Visível             | Visível            |
| Toggle Collapse            | Oculto          | Oculto              | Visível            |
| User Name                  | Oculto          | Oculto              | Visível            |
| Dropdown Chevron           | Oculto          | Visível             | Visível            |
| Sidebar Labels (collapsed) | -               | -                   | Oculto             |

---

## 8. CÓDIGO DE REFERÊNCIA SIMPLIFICADO

### App.tsx (Layout Principal)
```tsx
import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentView, setCurrentView] = useState('DASHBOARD');
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-dark-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      <Sidebar
        currentView={currentView}
        onChangeView={(view) => {
          setCurrentView(view);
          setMobileMenuOpen(false); // Fecha menu ao navegar
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileMenuOpen={mobileMenuOpen}
        onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
      />
      
      <main className={`
        flex-1 transition-all duration-300
        ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-[295px]'}
      `}>
        <Header
          currentView={currentView}
          onMobileMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
        />
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Renderizar view baseado em currentView */}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
```

### ThemeContext.tsx
```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as Theme) || 'dark';
  });

  useEffect(() => {
    document.documentElement.className = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
```
