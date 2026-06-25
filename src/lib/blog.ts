import type { CollectionEntry } from 'astro:content';

export const categorias = [
	{
		slug: 'inteligencia-artificial',
		title: 'Inteligência Artificial',
		description:
			'Agentes, LLMs, superinteligência, automação, AGI e o futuro dos sistemas inteligentes.',
	},
	{
		slug: 'filosofia',
		title: 'Filosofia',
		description:
			'Nietzsche, soberania, ética da tecnologia, cyberpunk, transhumanismo e liberdade digital.',
	},
	{
		slug: 'defesa-cibernetica',
		title: 'Defesa Cibernética',
		description:
			'Blue Team, Red Team, Threat Intelligence, honeypots, malware analysis, logs e resposta a incidentes.',
	},
	{
		slug: 'soberania-digital',
		title: 'Soberania Digital',
		description:
			'Privacidade, criptografia, software livre, Big Techs, infraestrutura crítica e independência tecnológica.',
	},
	{
		slug: 'observatorio-digital',
		title: 'Observatório Digital',
		description:
			'Análises sobre IA, cibersegurança, vazamentos, regulação, geopolítica e acontecimentos digitais.',
	},
	{
		slug: 'laboratorios',
		title: 'Laboratórios',
		description:
			'Projetos práticos, FIAP, CTFs, VPS, Docker, Telegram Bots, experimentos e documentação técnica.',
	},
] as const;

export function getCategoria(slug: string) {
	return categorias.find((categoria) => categoria.slug === slug);
}

export function getCategoriaSlugFromPost(post: CollectionEntry<'artigos'>) {
	const partes = post.id.split('/');

	if (partes.length > 1) {
		return partes[0];
	}

	const categoriaNormalizada = post.data.category
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');

	const aliases: Record<string, string> = {
		'cyber-defense': 'defesa-cibernetica',
		'defesa-cibernetica': 'defesa-cibernetica',
		'inteligencia-artificial': 'inteligencia-artificial',
		'filosofia': 'filosofia',
		'soberania-digital': 'soberania-digital',
		'observatorio-digital': 'observatorio-digital',
		'laboratorios': 'laboratorios',
	};

	return aliases[categoriaNormalizada] ?? 'laboratorios';
}

export function getPostSlug(post: CollectionEntry<'artigos'>) {
	const partes = post.id.split('/');
	return partes[partes.length - 1];
}

export function getArticleUrl(post: CollectionEntry<'artigos'>) {
	return `/${getCategoriaSlugFromPost(post)}/${getPostSlug(post)}/`;
}
