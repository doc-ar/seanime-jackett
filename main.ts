/// <reference path="./anime-torrent-provider.d.ts" />
/// <reference path="./core.d.ts" />

class Provider {
    private jackettUrl = "{{jackettUrl}}"
    private jackettApiKey = "{{jackettApiKey}}"
    private indexers = "{{indexers}}"

    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution", "query"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const results = await this.fetchJackett(opts.query)
        return results.map(r => this.toAnimeTorrent(r))
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        const query = opts.query || this.buildQuery(opts)

        if (opts.batch) {
            const results = await this.fetchJackett(query)
            return results
                .map(r => this.toAnimeTorrent(r))
                .filter(t => t.isBatch && this.matchesResolutionStr(t.resolution, opts.resolution))
        }

        let epQuery = query
        if (opts.episodeNumber > 0) {
            const ep = String(opts.episodeNumber).padStart(2, "0")
            epQuery = `${query} ${ep}`
        }

        const results = await this.fetchJackett(epQuery)
        return results
            .map(r => this.toAnimeTorrent(r))
            .filter(t => this.matchesResolutionStr(t.resolution, opts.resolution))
    }

    private buildQuery(opts: AnimeSmartSearchOptions): string {
        const allTitles = [
            opts.media.romajiTitle,
            opts.media.englishTitle || "",
            ...(opts.media.synonyms || []),
        ].filter(Boolean)

        const { titles, season, part } = $scannerUtils.buildSmartSearchTitles(allTitles)
        const baseTitle = titles[0] || opts.media.romajiTitle

        if (season > 1) return `${baseTitle} Season ${season}`
        if (part > 1) return `${baseTitle} Part ${part}`
        return baseTitle
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        return torrent.infoHash || ""
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        const results = await this.fetchJackett("anime")
        return results.map(r => this.toAnimeTorrent(r))
    }

    private async fetchJackett(query: string): Promise<JackettResult[]> {
        const baseUrl = this.jackettUrl.replace(/\/$/, "")
        const indexer = (this.indexers || "all").trim()
        const url = `${baseUrl}/api/v2.0/indexers/${indexer}/results?apikey=${encodeURIComponent(this.jackettApiKey)}&Query=${encodeURIComponent(query)}&Category[]=5070`

        console.log(`[jackett-provider] GET ${url}`)

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Jackett request failed: ${response.status} ${response.statusText}`)
        }

        const data: JackettResponse = await (response.json<JackettResponse>() as any)
        return data.Results || []
    }

    // opts resolution is e.g. "1080" or "720" (no trailing p); torrent resolution may be "1080p"
    private matchesResolutionStr(torrentRes: string, filterRes: string): boolean {
        if (!filterRes || filterRes === "") return true
        if (!torrentRes || torrentRes === "") return true  // unknown resolution — don't filter out
        return torrentRes.includes(filterRes)
    }

    private detectBatch(r: JackettResult, parsed: $habari.Metadata): boolean {
        // Explicit batch keywords in title
        if (/\b(batch|complete series|complete pack|full series)\b/i.test(r.Title)) return true

        // Habari parsed an episode range: episode_number="01", other_episode_number="12"
        if (parsed.other_episode_number && parsed.other_episode_number.length > 0) return true

        // Episode range pattern directly in title: "01-12", "01~12", "E01-E12"
        if (/\b\d{1,3}[-~]\d{1,3}\b/.test(r.Title)) return true

        // No episode number at all — likely a full season pack if reasonably large (>1 GB)
        const hasEpisode = parsed.episode_number && parsed.episode_number.length > 0
        if (!hasEpisode && r.Size > 1_073_741_824) return true

        return false
    }

    private toAnimeTorrent(r: JackettResult): AnimeTorrent {
        const leechers = (r.Peers || 0) - (r.Seeders || 0)
        const parsed = $habari.parse(r.Title)
        const isBatch = this.detectBatch(r, parsed)
        return {
            name: r.Title,
            date: r.PublishDate || new Date().toISOString(),
            size: r.Size || 0,
            formattedSize: "",
            seeders: r.Seeders || 0,
            leechers: leechers > 0 ? leechers : 0,
            downloadCount: r.Grabs || 0,
            link: r.Details || r.Guid || "",
            downloadUrl: r.Link || "",
            magnetLink: r.MagnetUri || "",
            infoHash: r.InfoHash || "",
            resolution: parsed.video_resolution || "",
            isBatch,
            episodeNumber: isBatch ? -1 : this.parseEpisodeNumber(parsed),
            releaseGroup: parsed.release_group || "",
            isBestRelease: false,
            confirmed: false,
        }
    }

    private parseEpisodeNumber(parsed: $habari.Metadata): number {
        if (parsed.episode_number && parsed.episode_number.length > 0) {
            const n = parseInt(parsed.episode_number[0], 10)
            if (!isNaN(n) && n > 0) return n
        }
        return -1
    }
}

type JackettResponse = {
    Results: JackettResult[]
    Indexers: any[]
}

type JackettResult = {
    Title: string
    Guid: string
    Link: string
    Details: string
    PublishDate: string
    Size: number
    Grabs: number
    Seeders: number
    Peers: number
    InfoHash: string
    MagnetUri: string
    Tracker: string
    TrackerId: string
}
