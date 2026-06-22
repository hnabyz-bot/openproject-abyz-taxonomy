# frozen_string_literal: true

Gem::Specification.new do |spec|
  spec.name = "openproject-abyz-taxonomy"
  spec.version = "0.1.0"
  spec.authors = ["Abyz Lab"]
  spec.email = ["ops@abyz-lab.work"]
  spec.summary = "Abyz taxonomy/title support for OpenProject"
  spec.description = "Adds taxonomy nodes and assignments for display-only title rows and creation validation."
  spec.homepage = "https://github.com/hnabyz-bot/abyz-lab-pm"
  spec.license = "GPL-3.0-only"

  spec.files = Dir["app/**/*", "assets/**/*", "config/**/*", "db/**/*", "lib/**/*", "README.md"]
  spec.require_paths = ["lib"]
end

