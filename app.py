"""
app.py — Entry point for Argus, an AI-based Automated EDA Tool.
Routes between the auth page and the main home page.
"""

import streamlit as st

from utils import find_logo_path

icon_path = find_logo_path() or "📊"

st.set_page_config(
    page_title="Argus – An AI based Automated EDA Tool",
    page_icon=icon_path,
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""<style>
/* ───────────────────────────────────────────────────────── */
/* GLOBAL BEAUTIFUL BUTTON STYLES FOR ENTIRE ARGUS APP       */
/* ───────────────────────────────────────────────────────── */

/* 1. Base / Secondary Buttons */
button[data-testid="baseButton-secondary"] {
    background: rgba(255, 255, 255, 0.04) !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 12px !important;
    color: #e2e8f0 !important;
    font-size: 15px !important;
    font-weight: 600 !important;
    padding: 8px 12px !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    height: auto !important;
    min-height: 44px !important;
    line-height: 1.3 !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
}
button[data-testid="baseButton-secondary"]:hover {
    background: rgba(249, 115, 22, 0.08) !important;
    border-color: rgba(249, 115, 22, 0.4) !important;
    color: #F97316 !important;
    box-shadow: 0 0 15px rgba(249, 115, 22, 0.2) !important;
    transform: translateY(-2px) !important;
}

/* 2. Primary Buttons */
button[data-testid="baseButton-primary"] {
    background: linear-gradient(135deg, #F97316, #EA580C) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 12px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    padding: 8px 12px !important;
    white-space: normal !important;
    word-wrap: break-word !important;
    height: auto !important;
    min-height: 44px !important;
    line-height: 1.3 !important;
    box-shadow: 0 10px 25px -5px rgba(249, 115, 22, 0.4) !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
button[data-testid="baseButton-primary"]:hover {
    box-shadow: 0 14px 30px -5px rgba(249, 115, 22, 0.5) !important;
    transform: translateY(-3px) !important;
    filter: brightness(1.05) !important;
}

/* 3. Form Submit Buttons (Make them distinct) */
div[data-testid="stFormSubmitButton"] > button {
    background: linear-gradient(135deg, #6366f1, #4f46e5) !important;
    color: #ffffff !important;
    border: none !important;
    border-radius: 12px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    padding: 10px 22px !important;
    box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.4) !important;
    transition: all 0.25s ease !important;
}
div[data-testid="stFormSubmitButton"] > button:hover {
    box-shadow: 0 14px 30px -5px rgba(99, 102, 241, 0.5) !important;
    transform: translateY(-2px) !important;
    filter: brightness(1.1) !important;
}

/* 4. Fix standard hyperlink/tertiary buttons to match theme instead of plain blue */
button[kind="tertiary"], button[data-testid="baseButton-tertiary"], a:not([class^="arg-"]) {
    color: #9ca3af !important;
    transition: all 0.2s ease !important;
    text-decoration: none !important;
}
button[kind="tertiary"]:hover, button[data-testid="baseButton-tertiary"]:hover, a:not([class^="arg-"]):hover {
    color: #F97316 !important;
    text-shadow: 0 0 10px rgba(249, 115, 22, 0.3) !important;
}

/* 5. File Uploader Browse Button */
[data-testid="stFileUploader"] section > button {
    background: rgba(255, 255, 255, 0.05) !important;
    border: 1px dashed rgba(249, 115, 22, 0.4) !important;
    border-radius: 12px !important;
    color: #F97316 !important;
    font-weight: 600 !important;
    padding: 8px 20px !important;
    transition: all 0.25s ease !important;
}
[data-testid="stFileUploader"] section > button:hover {
    background: rgba(249, 115, 22, 0.1) !important;
    border-color: #F97316 !important;
    box-shadow: 0 0 15px rgba(249, 115, 22, 0.2) !important;
}

/* Override Streamlit's default ugly focus ring */
button:focus {
    outline: none !important;
    box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.2) !important;
}

/* ─────────────────────────────────────────────────────────────
   GLOBAL MOBILE RESPONSIVE — viewport fixes for all screens
   ─────────────────────────────────────────────────────────────*/

/* Prevent horizontal scroll on mobile */
html, body, .stApp {
    overflow-x: hidden !important;
    max-width: 100vw !important;
    -webkit-tap-highlight-color: transparent;
}

/* Streamlit's main block — full width on mobile */
.main .block-container {
    max-width: 100% !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
}

/* Tablet (<= 900px) adjustments */
@media (max-width: 900px) {
    .main .block-container { padding-left: 12px !important; padding-right: 12px !important; }
    [data-testid="stTabs"] > div:first-child { flex-wrap: wrap !important; gap: 6px !important; }
    [data-testid="stTab"] { font-size: 0.85rem !important; padding: 8px 14px !important; min-width: 80px !important; }
}

@media (max-width: 600px) {
    /* Streamlit sidebar toggle: ensure it's visible */
    [data-testid="collapsedControl"] {
        display: flex !important;
    }

    /* Buttons: larger touch targets on mobile */
    button[data-testid="baseButton-secondary"],
    button[data-testid="baseButton-primary"] {
        font-size: 13.5px !important;
        padding: 12px 10px !important;
        min-height: 48px !important;
    }

    /* File uploader: full width */
    [data-testid="stFileUploader"] {
        width: 100% !important;
    }

    /* Plotly charts: prevent overflow */
    .js-plotly-plot, .plot-container {
        max-width: 100% !important;
        overflow-x: hidden !important;
    }

    /* DataFrames: scrollable horizontally */
    [data-testid="stDataFrame"] {
        overflow-x: auto !important;
    }

    /* Select boxes / sliders */
    [data-testid="stSelectbox"],
    [data-testid="stSlider"],
    [data-testid="stTextInput"],
    [data-testid="stTextArea"],
    [data-testid="stNumberInput"] {
        width: 100% !important;
    }

    /* Full-width button stacks on mobile */
    [data-testid="stButton"] > button {
        width: 100% !important;
        margin-bottom: 8px !important;
        min-height: 46px !important;
    }

    /* Tab columns stack on mobile */
    [data-testid="stTabs"] > div:first-child {
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        overflow-y: hidden !important;
        gap: 8px !important;
        padding-bottom: 8px !important;
    }
    [data-testid="stTabs"] > div:first-child::-webkit-scrollbar {
        height: 4px;
    }
    [data-testid="stTabs"] > div:first-child::-webkit-scrollbar-thumb {
        background: rgba(249, 115, 22, 0.4);
        border-radius: 4px;
    }
    [data-testid="stTab"] {
        font-size: 0.85rem !important;
        padding: 8px 14px !important;
        min-width: max-content !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        letter-spacing: 0 !important;
    }
    [data-testid="stTab"][aria-selected="true"] {
        font-size: 0.9rem !important;
    }

    /* Metric card values scale down */
    .metric-card .mc-value { font-size: 1.6rem !important; }

    /* Chat bubbles readable on small screens */
    .chat-bubble { font-size: 0.82rem !important; padding: 10px 12px !important; }

    /* Glossy metric cards: stack on mobile */
    div[style*="grid-template-columns:repeat(4"] {
        grid-template-columns: repeat(2, 1fr) !important;
    }
}

@media (max-width: 400px) {
    /* Single column metrics */
    div[style*="grid-template-columns:repeat(" i] {
        grid-template-columns: 1fr !important;
    }

    [data-testid="stTabs"] > div:first-child {
        gap: 6px !important;
    }
    [data-testid="stTab"] {
        font-size: 0.78rem !important;
        padding: 7px 11px !important;
    }
}
</style>""", unsafe_allow_html=True)

# Inject viewport meta tag for proper mobile rendering and dynamic viewport handling
st.markdown(
    '''<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <script>
      (function () {
        function setVh() {
          var vh = window.innerHeight * 0.01;
          document.documentElement.style.setProperty('--vh', vh + 'px');
        }
        setVh();
        window.addEventListener('resize', setVh);
      })();
    </script>''',
    unsafe_allow_html=True,
)

from auth import show_auth_page, authenticate_from_cookie
from home import show_home_page

# Try to authenticate the user from a potential JWT cookie
if not st.session_state.get("logged_in"):
    authenticate_from_cookie()

if not st.session_state.get("logged_in"):
    show_auth_page()
elif st.session_state.get("guest_mode"):
    show_home_page(guest=True)
else:
    show_home_page()
