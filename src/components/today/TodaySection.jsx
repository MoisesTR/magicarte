import { Link } from 'react-router-dom'

export default function TodaySection({ id, title, children, href, className = '' }) {
  return (
    <section id={`today-${id}`} aria-labelledby={`today-${id}-heading`} className={`min-w-0 rounded-2xl bg-white p-4 shadow-soft sm:p-5 ${className}`}>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <h2 id={`today-${id}-heading`} className='text-lg font-bold text-gray-800'>{title}</h2>
        {href && <Link to={href} className='inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2'>Ver todo <span aria-hidden='true' className='ml-1'>→</span></Link>}
      </div>
      {children}
    </section>
  )
}
