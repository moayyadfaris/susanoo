exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex('interests').del()
    .then(function () {
      // Inserts seed entries
      return knex('interests').insert([
        { id: 1, name: 'Sports' },
        { id: 2, name: 'Emergencies' },
        { id: 3, name: 'Events' },
        { id: 4, name: 'Weather events' },
        { id: 5, name: 'Politics' },
        { id: 6, name: 'Traffic' },
        { id: 7, name: 'Technology' }
      ])
    })
}
