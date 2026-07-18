import React from 'react'
export default function PageHeading({title, description}){
  return (
    <div className="page-heading">
      <div>
        <h2>{title}</h2>
        <p className="page-copy">{description}</p>
      </div>
    </div>
  )
}
