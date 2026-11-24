import React, { createContext, useContext, useState, useEffect } from 'react'

// Context for theme switching.  Three themes are supported: light,
// dark and blue.  The current theme is stored in localStorage and
// applied as a class on the <html> element.  CSS variables defined
// in src/styles/index.css respond to the class to change colors.

const ThemeContext = createContext({})

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('theme') || 'light'
  })

  useEffect(() => {
    // Apply the theme class to the html root element
    const root = document.documentElement
    root.classList.remove('light', 'dark', 'night')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  function setTheme(newTheme) {
    setThemeState(newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}