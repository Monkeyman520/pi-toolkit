import { type Static, Type } from "typebox";
import { Check } from "typebox/value";

const strings = Type.Array(Type.String());
const object = { additionalProperties: false } as const;
export const StageSchema = Type.Union([
	Type.Literal("agent"),
	Type.Literal("request"),
]);
export const PointSchema = Type.Union([
	Type.Literal("agent.before"),
	Type.Literal("agent.after"),
	Type.Literal("request.before"),
	Type.Literal("request.after"),
]);
export const ActionSchema = Type.Union([
	Type.Object(
		{
			type: Type.Literal("literal"),
			find: Type.String({ minLength: 1 }),
			replace: Type.String(),
			firstOnly: Type.Optional(Type.Boolean()),
		},
		object,
	),
	Type.Object(
		{
			type: Type.Literal("regex"),
			pattern: Type.String(),
			flags: Type.Optional(Type.String()),
			replace: Type.String(),
		},
		object,
	),
	Type.Object(
		{
			type: Type.Literal("removeLines"),
			pattern: Type.String(),
			flags: Type.Optional(Type.String()),
		},
		object,
	),
	Type.Object({ type: Type.Literal("prepend"), text: Type.String() }, object),
	Type.Object({ type: Type.Literal("append"), text: Type.String() }, object),
	Type.Object(
		{ type: Type.Literal("file"), path: Type.String({ minLength: 1 }) },
		object,
	),
	Type.Object(
		{
			type: Type.Literal("script"),
			path: Type.String({ minLength: 1 }),
			options: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
		},
		object,
	),
]);
export const RuleSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
		enabled: Type.Optional(Type.Boolean()),
		stage: StageSchema,
		when: Type.Optional(
			Type.Object(
				{
					providers: Type.Optional(strings),
					models: Type.Optional(strings),
					customPrompt: Type.Optional(Type.Boolean()),
					extensions: Type.Optional(
						Type.Object(
							{
								all: Type.Optional(strings),
								any: Type.Optional(strings),
								none: Type.Optional(strings),
							},
							object,
						),
					),
				},
				object,
			),
		),
		targets: Type.Array(
			Type.String({
				pattern:
					"^(intro|docs?|skills?|tools|rules|cwd|all|tag:[A-Za-z_][A-Za-z0-9_.:-]*)$",
			}),
			{ minItems: 1 },
		),
		actions: Type.Array(ActionSchema, { minItems: 1 }),
	},
	object,
);
export const ConfigSchema = Type.Object(
	{
		antigravityCompat: Type.Optional(Type.Boolean()),
		rules: Type.Optional(Type.Array(RuleSchema)),
		export: Type.Optional(
			Type.Object(
				{
					points: Type.Optional(Type.Array(PointSchema)),
					directory: Type.Optional(Type.String({ minLength: 1 })),
				},
				object,
			),
		),
		logging: Type.Optional(
			Type.Union([
				Type.Literal("silent"),
				Type.Literal("error"),
				Type.Literal("info"),
			]),
		),
	},
	object,
);
export type Rule = Static<typeof RuleSchema>;
export type Action = Static<typeof ActionSchema>;
export type Stage = Static<typeof StageSchema>;
export type Point = Static<typeof PointSchema>;
export type Config = Static<typeof ConfigSchema>;
export function validateConfig(value: unknown): Config {
	if (!Check(ConfigSchema, value))
		throw new Error(
			"Invalid prompt-pipeline configuration (see README schema).",
		);
	const ids = new Set<string>();
	for (const rule of value.rules ?? []) {
		if (ids.has(rule.id))
			throw new Error("Duplicate rule ID in configuration.");
		ids.add(rule.id);
	}
	return value;
}
