import React from 'react'

type Tab = 'sales' | 'admin' | 'customers' | 'products' | 'users' | 'about'

export default function Nav(
  props: {
    tab: Tab,
    setTab: (t: Tab) => void,
    isAdmin?: boolean
  }
) {
  const { tab, setTab, isAdmin } = props

  const Btn = (p: { id: Tab, children: React.ReactNode }) => (
    <button
      className={'btn ' + (tab === p.id ? 'primary' : '')}
      onClick={() => setTab(p.id)}
    >
      {p.children}
    </button>
  )

  return (
    <nav>
      <Btn id="sales">Sales</Btn>
      <Btn id="admin">Admin</Btn>
      <Btn id="customers">Customers</Btn>
      <Btn id="products">Products</Btn>
      {isAdmin && <Btn id="users">Users</Btn>}
      <Btn id="about">About</Btn>
    </nav>
  )
}
