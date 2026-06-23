# frozen_string_literal: true

# Load the host OpenProject application's spec_helper.
# When `bundle exec rspec` runs from the OP app root, the plugin's specs are
# evaluated in the context of the host app, so the bare `spec_helper` resolves
# to OP core's configuration (SimpleCov, DatabaseCleaner, etc.).
require "spec_helper"
