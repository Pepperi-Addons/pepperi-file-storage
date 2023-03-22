export const FileScheme =
{
	"type": "object",
	"properties": {
		"Key": {
			"description" : "/'s in the name will organize the files in folders",
			"type": "string"
		},
		"Folder": {
			"description" : "Readonly",
			"type": "string"
		},
		"Name": {
			"description" : "Readonly",
			"type": "string"
		},
		"Description": {
			"description" : "Red Shoe",
			"type": "string"
		},
		"MIME": {
			"description" : "in case of folder MIME type is 'pepperi/folder'",
			"type": "string"
		},
		"Sync": {
			"description" : "default is None",
			"type": "string",
			"oneOf":[
				"None",
				"Device",
				"DeviceThumbnail",
				"Always"
			]
		},
		"URL": {
			"description" : "the CDN URL",
			"type": "string"
		},
		"URI": {
			"description" : "Mandatory on create. empty 'URI' means a creation of a folder. Can be a http URL or base64 data URI",
			"type": "string"
		}
        
	},

	"required": [ "Key", "MIME", "URI"]
};
