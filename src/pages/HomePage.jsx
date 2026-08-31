import './Page.css'
import Button from '../components/ui/Button'

function HomePage() {
  const handleClick = () => {
    window.alert('Button works')
  }

  return (
    <section className="page">
      <h1 className="page__title">Главная</h1>
      <p>Это тестовая страница для проверки компонента Button.</p>
      <Button type="button" disabled={false} onClick={handleClick}>
        Тестовая кнопка
      </Button>
    </section>
  )
}

export default HomePage
