# frozen_string_literal: true

Rails.application.routes.draw do
  namespace :abyz_taxonomy do
    get "ui/tree", to: "ui#tree", defaults: { format: :json }
    post "ui/project_titles", to: "ui#create_project_title", defaults: { format: :json }
    post "ui/projects", to: "ui#create_project", defaults: { format: :json }
    post "ui/wp_sections", to: "ui#create_wp_section", defaults: { format: :json }
    post "ui/work_packages", to: "ui#create_work_package", defaults: { format: :json }
  end
end
