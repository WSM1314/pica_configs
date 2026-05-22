class NewComicSource extends ComicSource {

    name = "Hentai-One"

    key = "hentai_one_source"

    version = "1.0.0"

    minAppVersion = "3.1.4"

    url = "https://ch.hentai-one.com/"

    // 基础域名
    baseUrl = "https://ch.hentai-one.com"

    init() {
        // 初始化逻辑，暂无
    }

    /// 账号功能（该网站通常不强制登录即可看图，这里设置为 null 禁用）
    account = null

    /// 探索页面
    explore = [
        {
            title: "最新更新",
            type: "multiPageComicList",
            load: async (page) => {
                // 首页/最新列表的分页 URL 格式
                let url = page === 1 ? `${this.baseUrl}/` : `${this.baseUrl}/page/${page}/`;
                let res = await Network.get(url);

                if (res.status !== 200) {
                    throw `加载失败，状态码: ${res.status}`;
                }

                // 注意：App 底层需要解析 HTML，以下为基于常见类库或正则的伪解析逻辑
                // 由于 App 环境限制，这里使用正则表达式从 HTML 中提取数据
                return this.parseHtmlToComicList(res.body);
            }
        }
    ]

    /// 分类页面
    category = {
        title: "分类探索",
        parts: [
            {
                name: "热门标签",
                type: "fixed",
                itemType: "category",
                categories: ["全部", "同人志", "单行本", "杂志", "全彩", "韩漫"],
                categoryParams: ["", "doujinshi", "manga", "magazine", "full-color", "webtoon"]
            }
        ],
        enableRankingPage: false,
    }

    /// 分类漫画页面
    categoryComics = {
        load: async (category, param, options, page) => {
            let url = "";
            if (!param) {
                url = page === 1 ? `${this.baseUrl}/` : `${this.baseUrl}/page/${page}/`;
            } else {
                url = page === 1 ? `${this.baseUrl}/tag/${param}/` : `${this.baseUrl}/tag/${param}/page/${page}/`;
            }

            let res = await Network.get(url);
            if (res.status !== 200) throw `分类加载失败: ${res.status}`;

            return this.parseHtmlToComicList(res.body);
        }
    }

    /// 搜索功能
    search = {
        load: async (keyword, options, page) => {
            // 编码搜索关键词
            let encodedKeyword = encodeURIComponent(keyword);
            let url = page === 1 
                ? `${this.baseUrl}/?s=${encodedKeyword}` 
                : `${this.baseUrl}/page/${page}/?s=${encodedKeyword}`;

            let res = await Network.get(url);
            if (res.status !== 200) throw `搜索失败: ${res.status}`;

            return this.parseHtmlToComicList(res.body);
        }
    }

    /// 收藏（使用 App 本地收藏，无需网络同步）
    favorites = null

    /// 单个漫画详情与阅读
    comic = {
        loadInfo: async (id) => {
            // id 即为该漫画的 URL 相对路径或绝对路径，例如 "/comic/xxxx"
            let url = id.startsWith("http") ? id : `${this.baseUrl}${id}`;
            let res = await Network.get(url);
            if (res.status !== 200) throw `详情加载失败: ${res.status}`;

            let html = res.body;

            // 1. 提取标题 (通过正则匹配类似 <h1>标题</h1>)
            let titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
            let title = titleMatch ? titleMatch[1].trim() : "未知标题";

            // 2. 提取封面
            let coverMatch = html.match(/<div class="comic-cover">[\s\S]*?src="([^"]+)"/);
            let cover = coverMatch ? coverMatch[1] : "";

            // 3. 提取章节（这类网站通常一本书就是一个单本，没有分话，直接加一个“开始阅读”的虚拟章节）
            let chapters = {};
            chapters[id] = "全一话";

            // 4. 提取标签
            let tagsArray = [];
            let tagMatches = html.matchAll(/<a href="[^"]*\/tag\/([^"]+)"[^>]*>([^<]+)<\/a>/g);
            for (let match of tagMatches) {
                tagsArray.push(match[2].trim());
            }

            return {
                title: title,
                cover: cover,
                description: "暂无简介",
                tags: {
                    "标签": tagsArray
                },
                chapters: chapters,
                isFavorite: null // 交给 App 本地管理
            };
        },

        // 获取章节图片
        loadEp: async (comicId, epId) => {
            let url = epId.startsWith("http") ? epId : `${this.baseUrl}${epId}`;
            let res = await Network.get(url);
            if (res.status !== 200) throw `图片列表加载失败: ${res.status}`;

            let html = res.body;
            let images = [];

            // 核心：利用正则抓取页面中所有的漫画图片 URL
            // 通常在内容区存在类似 <img data-src="..." 或 src="..." 的标签
            let imgMatches = html.matchAll(/<img[^>]+(?:data-)?src="([^"]+)"[^>]*class="[^"]*wp-manga-chapter-img[^"]*"/g);
            
            // 如果上面精确的类名没匹配到，可以用更宽泛的匹配（根据 Hentai-one 实际页面结构调整）
            if (!imgMatches) {
                imgMatches = html.matchAll(/<div class="page-break"[\s\S]*?src="([^"]+)"/g);
            }

            for (let match of imgMatches) {
                let imgUrl = match[1].trim();
                if (imgUrl && !images.includes(imgUrl)) {
                    images.push(imgUrl);
                }
            }

            return {
                images: images
            };
        },

        // 核心突破：解决图片防盗链（403 Forbidden）问题
        onImageLoad: (url, comicId, epId) => {
            return {
                url: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://ch.hentai-one.com/', // 必须加上来源伪装
                }
            };
        },

        onThumbnailLoad: (url) => {
            return {
                url: url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://ch.hentai-one.com/',
                }
            };
        }
    }

    /**
     * 辅助函数：将列表页面的 HTML 解析为 App 所需的漫画对象数组
     */
    parseHtmlToComicList(html) {
        let comics = [];
        
        // 使用正则提取列表项。根据该类 WordPress 漫画主题的基本结构进行匹配：
        // 匹配包含链接、标题、封面的标准卡片
        let itemMatches = html.matchAll(/<div class="[^"]*page-item[^"]*">([\s\S]*?)<\/div><\/div>/g);
        
        // 如果上面这种结构不适用，通用的列表项正则：
        if (!itemMatches) {
            itemMatches = html.matchAll(/<div class="row c-tabs-item__content">([\s\S]*?)<\/div>\s*<\/div>/g);
        }

        for (let item of itemMatches) {
            let block = item[1];
            
            // 提取 URL 和 标题
            let urlTitleMatch = block.match(/<h3 class="h4"><a href="([^"]+)"[^>]*>([^<]+)<\/a>/);
            // 提取封面
            let coverMatch = block.match(/src="([^"]+)"/);

            if (urlTitleMatch) {
                let fullUrl = urlTitleMatch[1];
                // 转换为相对路径作为 ID
                let id = fullUrl.replace(this.baseUrl, ""); 
                let title = urlTitleMatch[2].trim();
                let cover = coverMatch ? coverMatch[1] : "";

                comics.push({
                    id: id,
                    title: title,
                    subTitle: "Hentai-One",
                    cover: cover,
                    tags: [],
                    description: ""
                });
            }
        }

        // 简易计算最大页数，从底部分页条匹配（例如匹配 "页次：1 / 105" 或者最后一个页码）
        let maxPage = 1;
        let maxPageMatch = html.match(/class="last" href="[^"]*\/page\/(\d+)\/"/);
        if (maxPageMatch) {
            maxPage = parseInt(maxPageMatch[1]);
        } else {
            // 尝试另一种常见的分页格式
            let pages = html.match(/href="[^"]*\/page\/(\d+)\//g);
            if (pages) {
                let lastPage = pages[pages.length - 1].match(/\/page\/(\d+)\//);
                if (lastPage) maxPage = parseInt(lastPage[1]);
            }
        }

        return {
            comics: comics,
            maxPage: maxPage
        };
    }
}
