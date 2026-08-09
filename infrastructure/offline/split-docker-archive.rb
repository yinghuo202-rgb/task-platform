#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "find"
require "json"
require "tmpdir"

abort "Usage: #{$PROGRAM_NAME} MULTI_IMAGE_ARCHIVE OUTPUT_DIRECTORY" unless ARGV.length == 2

archive = File.expand_path(ARGV[0])
output_dir = File.expand_path(ARGV[1])
abort "Archive not found: #{archive}" unless File.file?(archive)

FileUtils.mkdir_p(output_dir)

Dir.mktmpdir("docker-archive-split-") do |root|
  abort "Failed to extract Docker archive" unless system("tar", "-xf", archive, "-C", root)

  Find.find(root) do |path|
    if File.symlink?(path)
      File.lchmod(0o700, path)
    else
      File.chmod(File.directory?(path) ? 0o700 : 0o600, path)
    end
  end

  manifest = JSON.parse(File.read(File.join(root, "manifest.json")))
  repositories = JSON.parse(File.read(File.join(root, "repositories")))

  layer_dirs_by_inode = Hash.new { |hash, key| hash[key] = [] }
  Dir.glob(File.join(root, "*", "layer.tar")).each do |layer_path|
    layer_dirs_by_inode[File.stat(layer_path).ino] << File.basename(File.dirname(layer_path))
  end

  manifest.each do |entry|
    repo_tag = entry.fetch("RepoTags").fetch(0)
    separator = repo_tag.rindex(":")
    abort "Invalid image tag: #{repo_tag}" unless separator

    repository = repo_tag[0...separator]
    tag = repo_tag[(separator + 1)..]
    short_name = repository.sub(%r{\Adocker\.io/library/}, "")
    output_path = File.join(output_dir, "#{short_name}-#{tag}.tar")

    File.write(File.join(root, "manifest.json"), JSON.generate([entry]))
    File.write(
      File.join(root, "repositories"),
      JSON.generate(repository => { tag => repositories.fetch(repository).fetch(tag) })
    )

    paths = entry.fetch("Layers") + [entry.fetch("Config")]
    entry.fetch("Layers").each do |layer|
      inode = File.stat(File.join(root, layer)).ino
      layer_dirs_by_inode.fetch(inode).each do |layer_dir|
        paths.concat([
          "#{layer_dir}/layer.tar",
          "#{layer_dir}/VERSION",
          "#{layer_dir}/json"
        ])
      end
    end
    paths.concat(["manifest.json", "repositories"])
    paths.uniq!

    abort "Failed to create #{output_path}" unless system("tar", "-cf", output_path, "-C", root, *paths)
    puts output_path
  end
end
