import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Gigs from './pages/Gigs'
import Explore from './pages/Explore'
import PostDetail from './pages/PostDetail'
import Inbox from './pages/Inbox'
import Dm from './pages/Dm'
import GigDetail from './pages/GigDetail'
import CreateGig from './pages/CreateGig'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Notifications from './pages/Notifications'
import Tickets from './pages/Tickets'
import Orders from './pages/Orders'

export default function App(){
  return (
    <div className='min-h-screen flex flex-col'>
      <Navbar />
      <main className='flex-grow container py-8'>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/login' element={<Login />} />
          <Route path='/signup' element={<Signup />} />
          {/* Explore shows posts and jobs */}
          <Route path='/explore' element={<Explore />} />
          {/* Legacy gigs path still directs to explore for backward compatibility */}
          <Route path='/gigs' element={<Explore />} />
          <Route path='/gigs/create' element={<CreateGig />} />
          <Route path='/gigs/:id' element={<GigDetail />} />
          <Route path='/dashboard' element={<Dashboard />} />
          <Route path='/chat/:jobId' element={<Chat />} />
          {/* Direct message page */}
          <Route path='/dm/:otherId' element={<Dm />} />
          <Route path='/profile/:id' element={<Profile />} />
          {/* Post detail page */}
          <Route path='/posts/:id' element={<PostDetail />} />
          <Route path='/admin' element={<Admin />} />
        <Route path='/inbox' element={<Inbox />} />
        <Route path='/notifications' element={<Notifications />} />
          <Route path='/orders' element={<Orders />} />
          <Route path='/orders/:id' element={<Orders />} />
        <Route path='/tickets' element={<Tickets />} />
        <Route path='/tickets/:id' element={<Tickets />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}
