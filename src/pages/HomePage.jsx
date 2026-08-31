import './Page.css'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'

function HomePage() {
  const handleClick = () => {
    window.alert('Button works')
  }

  return (
    <section className="page">
      <h1 className="page__title">Главная</h1>
      <p>Это тестовая страница для проверки компонента Button.</p>
      <div className="home-page__card">
        <Card>
          <h2>Компоненты интерфейса</h2>
          <p>Card — переиспользуемый элемент интерфейса LovinTech CRM.</p>
        </Card>
      </div>
      <Button type="button" disabled={false} onClick={handleClick}>
        Тестовая кнопка
      </Button>
    </section>
  )
}

export default HomePage
