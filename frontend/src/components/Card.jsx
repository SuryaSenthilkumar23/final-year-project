import React from 'react'
export default function Card({title,value,small}){
  return <div className={`card${small? ' small':''}`}><div className="label">{title}</div><div className="value">{value}</div></div>
}
