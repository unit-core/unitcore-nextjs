export default function BlogLayout({ children }: LayoutProps<'/[lang]/blog'>) {
  return <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">{children}</div>
}
