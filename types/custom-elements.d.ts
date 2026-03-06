import "react";

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"elevenlabs-convai": React.DetailedHTMLProps<
				React.HTMLAttributes<HTMLElement> & {
					/** ElevenLabs agent ID */
					"agent-id"?: string;
					/** JSON-serialized dynamic variables object */
					"dynamic-variables"?: string;
				},
				HTMLElement
			>;
		}
	}
}
