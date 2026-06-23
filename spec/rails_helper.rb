# frozen_string_literal: true

# Load the host OpenProject application's rails_helper (boots Rails, loads
# FactoryBot, configures transactional fixtures, etc.), then this plugin's
# local spec_helper for any plugin-specific tweaks.
require "rails_helper"
require_relative "spec_helper"
