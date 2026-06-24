# frozen_string_literal: true

Rails.application.routes.draw do
  namespace :abyz_taxonomy do
    get "ui/tree", to: "ui#tree", defaults: { format: :json }
    patch "ui/assignments/move_wp", to: "ui#move_wp", defaults: { format: :json }
    patch "ui/assignments/move_project", to: "ui#move_project", defaults: { format: :json }
    post "ui/project_titles", to: "ui#create_project_title", defaults: { format: :json }
    post "ui/projects", to: "ui#create_project", defaults: { format: :json }
    post "ui/wp_sections", to: "ui#create_wp_section", defaults: { format: :json }
    post "ui/work_packages", to: "ui#create_work_package", defaults: { format: :json }
    get "ui/nodes/:code/settings/general", to: "ui#edit_node", constraints: { code: /[^\/]+/ }
    patch "ui/nodes/:code/settings/general", to: "ui#update_node_settings", constraints: { code: /[^\/]+/ }
    patch "ui/nodes/:code", to: "ui#update_node", constraints: { code: /[^\/]+/ }, defaults: { format: :json }
    delete "ui/nodes/:code", to: "ui#delete_node", constraints: { code: /[^\/]+/ }, defaults: { format: :json }
  end
end
