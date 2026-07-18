import { API_BASE_URL } from './apiConfig'

async function request(path, options={}){
  const url = API_BASE_URL + path
  const res = await fetch(url, options)
  if(!res.ok){
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText} - ${text}`)
  }
  const ct = res.headers.get('content-type') || ''
  if(ct.includes('application/json')) return res.json()
  return res.text()
}

export function get(path){ return request(path,{method:'GET', credentials:'same-origin'}) }
export function post(path, body, opts={}){
  return request(path, {method:'POST', body, ...opts})
}
