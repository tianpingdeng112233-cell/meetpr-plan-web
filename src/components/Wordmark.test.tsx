import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { Wordmark } from './Wordmark'

it('renders the 18px MeetPR wordmark with its accessible name', () => {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<Wordmark />)
  const image = host.querySelector('img')
  expect(image?.alt).toBe('MeetPR')
  expect(image?.getAttribute('src')).toBe('/meetpr-wordmark.svg')
  expect(image?.getAttribute('height')).toBe('18')
  expect(image?.style.height).toBe('18px')
})
